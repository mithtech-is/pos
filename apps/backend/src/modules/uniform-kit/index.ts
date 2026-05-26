import { Module } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../index";
import UniformKitModuleService from "./service";

export default Module(MODULE_KEYS.UNIFORM_KIT, {
  service: UniformKitModuleService,
});

export { UniformKitModuleService };
export const UNIFORM_KIT_MODULE = MODULE_KEYS.UNIFORM_KIT;
