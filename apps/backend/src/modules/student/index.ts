import { Module } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../index";
import StudentModuleService from "./service";

export default Module(MODULE_KEYS.STUDENT, {
  service: StudentModuleService,
});

export { StudentModuleService };
export const STUDENT_MODULE = MODULE_KEYS.STUDENT;
