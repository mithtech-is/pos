import { MedusaService } from "@medusajs/framework/utils";
import { UniformKit } from "./models/uniform-kit";
import { UniformKitItem } from "./models/uniform-kit-item";
import { UniformRule } from "./models/uniform-rule";

class UniformKitModuleService extends MedusaService({
  UniformKit,
  UniformKitItem,
  UniformRule,
}) {
  /**
   * Resolve the suggested kit for a school/class/gender/uniform-type cell.
   * Returns the kit ID or null if no rule has been authored yet.
   */
  async findKitByContext(args: {
    school_id: string;
    class_id: string;
    gender: "boy" | "girl" | "unisex";
    uniform_type: string;
    academic_year_id: string;
  }) {
    const [rule] = await this.listUniformRules({
      school_id: args.school_id,
      class_id: args.class_id,
      gender: args.gender,
      uniform_type: args.uniform_type,
      academic_year_id: args.academic_year_id,
    });
    if (!rule) return null;

    const kit = await this.retrieveUniformKit(rule.kit_id, {
      relations: ["items"],
    });
    return kit;
  }
}

export default UniformKitModuleService;
