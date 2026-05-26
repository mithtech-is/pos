import { MedusaService } from "@medusajs/framework/utils";
import { StudentProfile } from "./models/student-profile";

class StudentModuleService extends MedusaService({ StudentProfile }) {
  /**
   * Find or create a student profile based on (school_id, parent_mobile, student_name).
   * The trio is "good enough" identity for uniform sales — same student may be
   * billed multiple times across academic years.
   */
  async upsertProfile(args: {
    student_name: string;
    parent_mobile?: string;
    parent_email?: string;
    school_id: string;
    class_id?: string;
    gender?: "boy" | "girl" | "unisex";
  }) {
    if (args.parent_mobile) {
      const [existing] = await this.listStudentProfiles({
        school_id: args.school_id,
        parent_mobile: args.parent_mobile,
        student_name: args.student_name,
      });
      if (existing) {
        return this.updateStudentProfiles({
          selector: { id: existing.id },
          data: args,
        });
      }
    }
    return this.createStudentProfiles(args);
  }
}

export default StudentModuleService;
