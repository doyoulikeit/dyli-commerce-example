export const version: 1;
export type PackSceneOptions = {
  artwork: {
    version: 1;
    model_url: string;
    texture_url?: string;
    poster_url: string;
  };
  mode?: "preview" | "rip";
  interactive?: boolean;
  speed?: number;
  active?: boolean;
  onReady?: () => void;
  onStart?: () => void;
  onTear?: (progress: number, moving: boolean) => void;
  onExit?: () => void;
  onComplete?: () => void;
  onError?: () => void;
};
export type PackScene = {
  init(): Promise<void>;
  setActive(active: boolean): void;
  open(): void;
  dispose(): void;
};
export function createPackScene(
  element: HTMLElement,
  options: PackSceneOptions,
): PackScene;
