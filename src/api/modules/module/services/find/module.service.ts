import { FindAndCountOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { ModuleAttributes } from "../../models/module.model";

const getModulesList = async (options?: IListOptions<ModuleAttributes>) => {
  try {
    let { where, page, limit, order } = options || {};

    const queryOptions: FindAndCountOptions<ModuleAttributes> = {
      where: { ...where, active: 1 },
      order,
    };

    if (limit && !page) page = 1;

    if (limit && page) {
      queryOptions.offset = (page - 1) * limit;
      queryOptions.limit = limit;
    }

    const { count, rows } = await DataBase.instance.module.findAndCountAll(queryOptions);

    return { page, count, rows, limit };
  } catch (error) {
    throw error;
  }
};

const getModuleById = async (id: number) => {
  try {
    return await DataBase.instance.module.findOne({ where: { id } });
  } catch (error) {
    throw error;
  }
};

const getAllModules = async () => {
  try {
    return await DataBase.instance.module.findAll({ where: { active: 1 }, order: [["position", "ASC"]] });
  } catch (error) {
    throw error;
  }
};

export { getModulesList, getModuleById, getAllModules };
