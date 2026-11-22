import { BuildOptions, DataTypes, Model, Sequelize } from "sequelize";

// Avance de una persona en una lección del modo enseñanza (21-nov). Siempre
// del usuario REAL (aunque practique con su usuario de práctica) y de su
// empresa real: así el administrador ve quién completó qué.
export type TutorialProgressStatus = "in_progress" | "completed";

export interface TutorialProgressAttributes {
  id: number;
  company_id: number;
  user_id: number;
  lesson_code: string;
  status: TutorialProgressStatus;
  step_index: number;
  completed_at: Date | null;
  created_by: number;
  created_at: Date;
  updated_by: number;
  updated_at: Date;
}

export interface TutorialProgressModel extends Model<TutorialProgressAttributes>, TutorialProgressAttributes {}

export class TutorialProgress extends Model<TutorialProgressAttributes, TutorialProgressModel> {}

export type TutorialProgressStatic = typeof Model & {
  new (values?: object, options?: BuildOptions): TutorialProgressModel;
};

export function TutorialProgressFactory(sequelize: Sequelize): TutorialProgressStatic {
  return <TutorialProgressStatic>sequelize.define(
    "tutorial_progress",
    {
      id: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true, autoIncrement: true },
      company_id: { type: DataTypes.BIGINT, allowNull: false },
      user_id: { type: DataTypes.BIGINT, allowNull: false },
      lesson_code: { type: DataTypes.STRING(60), allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "in_progress" },
      step_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.BIGINT, allowNull: false },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_by: { type: DataTypes.BIGINT, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: "tutorial_progress", timestamps: false }
  );
}
