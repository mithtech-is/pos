import { Module } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../index";
import ReceiptModuleService from "./service";

export default Module(MODULE_KEYS.RECEIPT, {
  service: ReceiptModuleService,
});

export { ReceiptModuleService };
export const RECEIPT_MODULE = MODULE_KEYS.RECEIPT;
