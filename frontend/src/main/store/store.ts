import Store, { Schema } from "electron-store";

export type StoreType = {
  isCompact: boolean;
  approvedPlugins: string[];
};

const schema: Schema<StoreType> = {
  isCompact: {
    type: "boolean",
    default: false,
  },
  approvedPlugins: {
    type: "array",
    default: [],
  },
};

export const store = new Store<StoreType>({ schema });
