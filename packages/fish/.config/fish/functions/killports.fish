# kill whatever holds the common dev-server ports: Astro 4321-4329, Vite 5173-5179, misc 3000-3010.
# kills by port, not by process name — a stuck bun/deno/python dev server gets cleared too, not just node.
# also catches a `serve` (vercel/serve) that fell back to an OS-assigned ephemeral port (macOS 49152-65535)
# because its target port was taken: lsof only labels it `node`, so it's identified by argv via `ps` instead.
# -sTCP:LISTEN scopes it to listeners only, so a client merely connected to a remote port in range is spared.
# prints each victim's port(s) + name + pid first so you can eyeball what's dying.
function killports --description "Kill dev-port listeners (3000-3010, 4321-4329, 5173-5179) plus a stray serve on an ephemeral port"
    set -l specs tcp:3000-3010 tcp:4321-4329 tcp:5173-5179

    # -P/-n skip service- and host-name lookups so we get raw ":3000", not ":hbci".
    set -l lsof_args -P -n -sTCP:LISTEN
    for spec in $specs
        set -a lsof_args -i $spec
    end

    # -F pcn → machine-readable: p<pid> / c<command> / n<name> lines, grouped per process.
    set -l lines (lsof -F pcn $lsof_args 2>/dev/null)

    set -l pids
    set -l cmds
    set -l ports_list
    set -l cur_pid

    for line in $lines
        set -l tag (string sub -l 1 -- $line)
        set -l val (string sub -s 2 -- $line)
        switch $tag
            case p
                set cur_pid $val
                if not contains -- $cur_pid $pids
                    set -a pids $cur_pid
                    set -a cmds ""
                    set -a ports_list ""
                end
            case c
                set cmds[(contains -i -- $cur_pid $pids)] $val
            case n
                # name is *:3000 / 127.0.0.1:5173 / [::1]:3000 — port is whatever follows the last colon.
                set -l port (string split -r -m1 : -- (string replace -r ' .*' '' -- $val))[-1]
                set -l idx (contains -i -- $cur_pid $pids)
                # dedupe: a server bound on both IPv4 and IPv6 reports the same port twice.
                if not contains -- $port (string split , -- $ports_list[$idx])
                    if test -n "$ports_list[$idx]"
                        set ports_list[$idx] "$ports_list[$idx],$port"
                    else
                        set ports_list[$idx] $port
                    end
                end
        end
    end

    # serve (vercel/serve) listens on port 0 when its target port is taken, so the OS hands it a random
    # ephemeral port (macOS 49152-65535). that range is shared with rapportd / Logitech / VS Code / browsers,
    # and lsof labels serve as plain `node`, so scan the range but keep only processes whose argv actually
    # invokes serve — read from `ps`, which (unlike lsof) exposes the full command line.
    set -l eph_pids
    set -l eph_cmds
    set -l eph_ports
    set -l cur
    for line in (lsof -F pcn -P -n -sTCP:LISTEN -i tcp:49152-65535 2>/dev/null)
        set -l tag (string sub -l 1 -- $line)
        set -l val (string sub -s 2 -- $line)
        switch $tag
            case p
                set cur $val
                if not contains -- $cur $eph_pids
                    set -a eph_pids $cur
                    set -a eph_cmds ""
                    set -a eph_ports ""
                end
            case c
                set eph_cmds[(contains -i -- $cur $eph_pids)] $val
            case n
                set -l port (string split -r -m1 : -- (string replace -r ' .*' '' -- $val))[-1]
                set -l idx (contains -i -- $cur $eph_pids)
                if not contains -- $port (string split , -- $eph_ports[$idx])
                    if test -n "$eph_ports[$idx]"
                        set eph_ports[$idx] "$eph_ports[$idx],$port"
                    else
                        set eph_ports[$idx] $port
                    end
                end
        end
    end

    for i in (seq (count $eph_pids))
        set -l p $eph_pids[$i]
        # a serve already bound to a spec port is captured above; don't double-add it.
        contains -- $p $pids; and continue
        set -l cmdline (ps -p $p -o command= 2>/dev/null)
        # plain \bserve\b would also hit server.js / preserve; anchor serve to a path or command boundary.
        string match -qr -- '(^|/)serve(@|\s|$)' "$cmdline"; or continue
        set -a pids $p
        set -a cmds "$eph_cmds[$i] (serve)"
        set -a ports_list $eph_ports[$i]
    end

    if not set -q pids[1]
        echo "killports: nothing on dev ports (3000-3010, 4321-4329, 5173-5179) or a stray serve"
        return 0
    end

    # second pass for cwd — lsof needs -a to AND -d cwd with -p, otherwise it ORs them.
    # only the cwd descriptor is requested, so each pid yields exactly one n<path> line.
    set -l cwds
    for p in $pids
        set -a cwds ""
    end
    set -l cur_pid
    for line in (lsof -a -d cwd -p (string join , $pids) -F pn 2>/dev/null)
        set -l tag (string sub -l 1 -- $line)
        set -l val (string sub -s 2 -- $line)
        switch $tag
            case p
                set cur_pid $val
            case n
                set cwds[(contains -i -- $cur_pid $pids)] (string replace -- $HOME '~' $val)
        end
    end

    set -l c_reset (set_color normal)
    set -l c_port (set_color yellow)
    set -l c_cmd (set_color --bold)
    set -l c_pid (set_color brblack)
    set -l c_hdr (set_color --bold)
    if not isatty stdout
        set c_reset ""
        set c_port ""
        set c_cmd ""
        set c_pid ""
        set c_hdr ""
    end

    # build ":3000, :3001" display strings (ports sorted), then size the column to the widest.
    set -l disps
    for stored in $ports_list
        set -a disps ":"(string split , -- $stored | sort -n | string join ', :')
    end
    set -l maxw 0
    for d in $disps
        set -l l (string length -- $d)
        test $l -gt $maxw; and set maxw $l
    end
    # cwd hangs under the command column: 2 leading + port width + 2 gap.
    set -l indent (string repeat -n (math 4 + $maxw) ' ')

    echo "$c_hdr""killports""$c_reset"" — "(count $pids)" process(es) on dev ports:"
    for i in (seq (count $pids))
        printf '  %s%s%s  %s%s%s  %s(pid %s)%s\n' \
            $c_port (string pad -r -w $maxw -- $disps[$i]) $c_reset \
            $c_cmd $cmds[$i] $c_reset \
            $c_pid $pids[$i] $c_reset
        test -n "$cwds[$i]"; and printf '%s%s%s%s\n' $indent $c_pid $cwds[$i] $c_reset
    end

    read -l -P "$c_hdr""killports: ""$c_reset""kill "(count $pids)" process(es)? [Y/n] " reply
    if contains -- (string lower -- $reply) n no
        echo "killports: aborted"
        return 0
    end

    kill $pids
end
