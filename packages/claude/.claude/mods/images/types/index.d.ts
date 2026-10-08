/** One showing of images: an `/img <path>` or a `show_image` call. */
export type ImageEntry = {
  paths: string[];
  caption?: string;
  at: number;
};

declare module 'claude-code' {
  interface PluginState {
    images: {
      /** Newest first, capped. */
      history: ImageEntry[];
    };
  }
}
