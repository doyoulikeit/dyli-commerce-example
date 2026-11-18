export const version: 1;
export type PackSceneOptions = {
  artwork: {
    version: 1;
    model_url: string;
    texture_url?: string;
    material_map_url?: string;
    materials?: { body_top: string; body_bottom: string; body_blend: [number, number]; matte: boolean; iridescence: number };
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
