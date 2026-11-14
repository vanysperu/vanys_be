import { IToken } from "../../../../interfaces/IToken.interface";
import type { GuideDto } from "../../types/dispatch_guide.types";
import { loadGuideForCaller, toGuideDto } from "./guide_shared";

// Detalle de una guía (lectura: "ver todas las tiendas" amplía el alcance).
export const getGuideService = async (id: number, user: IToken): Promise<GuideDto> => toGuideDto(await loadGuideForCaller(id, user, "read"));
