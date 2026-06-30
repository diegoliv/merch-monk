import type { BoxChildObjectId, ObjectId } from "./types";

export const boxChildObjectIds: BoxChildObjectId[] = ["cap_box", "cup_box", "notebook_box"];

export const renderObjectIds: ObjectId[] = [
  "tote",
  "cup",
  "umbrela_open",
  "umbrela_closed",
  "notebook",
  "cap",
  "box",
  "flip_flop",
  "crewneck",
  "sweatpant",
];

export const objectIds: ObjectId[] = [...renderObjectIds, ...boxChildObjectIds];

export const objectLabels: Record<ObjectId, string> = {
  "tote": "Tote",
  cup: "Cup",
  umbrela_open: "Umbrella open",
  umbrela_closed: "Umbrella closed",
  notebook: "Notebook",
  cap: "Cap",
  box: "Box",
  cap_box: "Cap in box",
  cup_box: "Cup in box",
  notebook_box: "Notebook in box",
  flip_flop: "Flip flop",
  crewneck: "Crewneck",
  sweatpant: "Sweatpant",
};
