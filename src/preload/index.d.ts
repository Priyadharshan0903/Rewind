import type { RelayApi } from "./index";

declare global {
  interface Window {
    rewind: RelayApi;
  }
}

export {};
