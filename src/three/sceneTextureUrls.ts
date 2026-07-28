export type SceneTextureUrls = {
  crewneckLogo: string;
  boxBody: string;
  boxBottleLogo: string;
  boxNotebookLogo: string;
};

export const defaultSceneTextureUrls: SceneTextureUrls = {
  crewneckLogo: "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a5527787af01c167ce42d3c_f488968c6e31020e99fcf5deeeb44ad6_crewneck-logo.avif",
  boxBody: "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a5a88f85ff267f9a82727a8_box_body.avif",
  boxBottleLogo: "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a613ce5aa236d5e3064fef2_bottle-logo.avif",
  boxNotebookLogo: "https://cdn.prod.website-files.com/69fb6de67bc0fb48b4ab0147/6a613ce50330e513548c5356_notebook-logo.avif",
};

function resolveTextureUrl(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function resolveSceneTextureUrls(element: HTMLElement): SceneTextureUrls {
  return {
    crewneckLogo: resolveTextureUrl(element.dataset.textureCrewneckLogo, defaultSceneTextureUrls.crewneckLogo),
    boxBody: resolveTextureUrl(element.dataset.textureBoxBody, defaultSceneTextureUrls.boxBody),
    boxBottleLogo: resolveTextureUrl(element.dataset.textureBoxBottleLogo, defaultSceneTextureUrls.boxBottleLogo),
    boxNotebookLogo: resolveTextureUrl(element.dataset.textureBoxNotebookLogo, defaultSceneTextureUrls.boxNotebookLogo),
  };
}
