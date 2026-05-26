import { Module } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../index";
import SchoolModuleService from "./service";

export default Module(MODULE_KEYS.SCHOOL, {
  service: SchoolModuleService,
});

export { SchoolModuleService };
export const SCHOOL_MODULE = MODULE_KEYS.SCHOOL;
