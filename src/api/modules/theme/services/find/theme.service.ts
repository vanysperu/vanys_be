import { DataBase } from "../../../../../database";

const getActiveThemesList = async () => {
  return DataBase.instance.theme.findAll({
    where: { active: true },
    order: [["position", "ASC"]],
  });
};

export { getActiveThemesList };
