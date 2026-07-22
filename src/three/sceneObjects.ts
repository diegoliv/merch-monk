import type { BackgroundChildObjectId, BackgroundObjectId, BoxChildObjectId, NullObjectId, ObjectId } from "./types";

export const backgroundCollectionId: NullObjectId = "bg_collection";

export const boxChildObjectIds: BoxChildObjectId[] = ["cap_box", "cup_box", "notebook_box"];

export const backgroundObjectIds: BackgroundObjectId[] = [
  "bg_tote",
  "bg_cup",
  "bg_notebook",
  "bg_umbrela",
  "bg_notebook_2",
  "bg_cap",
  "bg_crewneck",
  "bg_flip-flop",
  "bg_sweatpants",
];
export const backgroundChildByParent: Partial<Record<BackgroundObjectId, BackgroundChildObjectId>> = {
  bg_tote: "tote.001",
  bg_cup: "cup.001",
  bg_notebook: "notebook.001",
  bg_umbrela: "umbrela_closed.001",
  bg_notebook_2: "notebook.002",
  bg_cap: "cap.001",
  "bg_flip-flop": "flip_flop.001",
  bg_sweatpants: "sweatpant.001",
};

export const backgroundChildObjectIds = Object.values(backgroundChildByParent) as BackgroundChildObjectId[];

export const backgroundParentByChild = Object.fromEntries(
  backgroundObjectIds.flatMap((parentId) => {
    const childId = backgroundChildByParent[parentId];
    return childId ? [[childId, parentId]] : [];
  }),
) as Record<BackgroundChildObjectId, BackgroundObjectId>;

export const renderObjectIds: ObjectId[] = [
  "tote",
  "cup",
  "umbrela_open",
  "umbrela_closed",
  "notebook",
  "cap",
  "box",
  "product_cup",
  "flip_flop",
  "crewneck",
  "sweatpant",
  ...backgroundObjectIds,
];

export const pinnableObjectIds: ObjectId[] = [backgroundCollectionId, ...renderObjectIds];

export const objectIds: ObjectId[] = [
  backgroundCollectionId,
  ...renderObjectIds.flatMap((id): ObjectId[] => {
    if (id === "box") return [id, ...boxChildObjectIds];
    if (backgroundObjectIds.includes(id as BackgroundObjectId)) {
      const childId = backgroundChildByParent[id as BackgroundObjectId];
      return childId ? [id, childId] : [id];
    }
    return [id];
  }),
];

export const objectLabels: Record<ObjectId, string> = {
  bg_collection: "Background collection",
  "tote": "Tote",
  cup: "Cup",
  umbrela_open: "Umbrella open",
  umbrela_closed: "Umbrella closed",
  notebook: "Notebook",
  cap: "Cap",
  box: "Box",
  product_cup: "Product cup",
  cap_box: "Cap in box",
  cup_box: "Cup in box",
  notebook_box: "Notebook in box",
  flip_flop: "Flip flop",
  crewneck: "Crewneck",
  sweatpant: "Sweatpant",
  bg_tote: "Background tote",
  bg_cup: "Background cup",
  bg_notebook: "Background notebook",
  bg_umbrela: "Background umbrella",
  bg_notebook_2: "Background notebook 2",
  bg_cap: "Background cap",
  bg_crewneck: "Background crewneck",
  "bg_flip-flop": "Background flip flop",
  bg_sweatpants: "Background sweatpants",
  "tote.001": "Tote in background",
  "cup.001": "Cup in background",
  "notebook.001": "Notebook in background",
  "umbrela_closed.001": "Umbrella in background",
  "notebook.002": "Notebook 2 in background",
  "cap.001": "Cap in background",
  "flip_flop.001": "Flip flop in background",
  "sweatpant.001": "Sweatpants in background",
};
