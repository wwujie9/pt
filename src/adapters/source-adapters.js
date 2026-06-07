import { resources } from "../data/resources.seed.js";

export const sourceAdapters = [
  {
    name: "Internal Library",
    type: "自有源",
    status: "online",
    async search({ mediaId }) {
      return resources.filter((resource) => resource.mediaId === mediaId && resource.source === this.name);
    },
  },
  {
    name: "Curated Archive",
    type: "授权索引",
    status: "online",
    async search({ mediaId }) {
      return resources.filter((resource) => resource.mediaId === mediaId && resource.source === this.name);
    },
  },
  {
    name: "Public Domain Mirror",
    type: "公共源",
    status: "limited",
    async search({ mediaId }) {
      return resources.filter((resource) => resource.mediaId === mediaId && resource.source === this.name);
    },
  },
];
