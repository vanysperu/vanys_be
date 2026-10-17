import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

const paramRoleIdValidator = param("roleId")
  .not()
  .isEmpty()
  .withMessage("El id del rol es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del rol debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const role = await DataBase.instance.role.findOne({ where: { id: Number(value) } });
    if (!role) throw new Error("El rol con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const getRoleResourceTreeValidator = [paramRoleIdValidator];

const idsArrayValidator = (field: string) =>
  body(field)
    .optional()
    .isArray()
    .withMessage("Debe ser un arreglo")
    .bail()
    .custom((value: unknown[]) => {
      if (!value.every((entry) => Number.isInteger(entry))) throw new Error("Todos los elementos deben ser enteros");
      if (new Set(value).size !== value.length) throw new Error("Todos los números deben ser únicos");
      return true;
    });

export const setRoleResourcesValidator = [
  paramRoleIdValidator,
  idsArrayValidator("resourceIds.add"),
  idsArrayValidator("resourceIds.remove"),
  body().custom((value) => {
    const add: number[] = value?.resourceIds?.add || [];
    const remove: number[] = value?.resourceIds?.remove || [];
    if (add.some((id) => remove.includes(id))) {
      throw new Error('Los valores en "resourceIds.add" y "resourceIds.remove" no deben ser iguales');
    }
    return true;
  }),
];
