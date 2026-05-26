import { MODULE_KEYS } from "../modules";

/**
 * Development seed script. Run with:
 *   npm --workspace apps/backend run seed
 *
 * Creates a baseline schema-of-data so the POS app has something to pull on
 * first sync: one academic year, two schools, two classes each, one kit
 * recipe per (school, class, gender) — enough to exercise the billing flow.
 */
export default async function seed({ container }: { container: any }) {
  const schools = container.resolve(MODULE_KEYS.SCHOOL);
  const kits = container.resolve(MODULE_KEYS.UNIFORM_KIT);
  const devices = container.resolve(MODULE_KEYS.POS_DEVICE);

  const year = await schools.createAcademicYears({
    name: "2026-2027",
    start_date: new Date("2026-06-01"),
    end_date: new Date("2027-05-31"),
    is_active: true,
  });

  const greenValley = await schools.createSchools({
    name: "Green Valley Public School",
    code: "GVPS",
    city: "Pune",
    status: "active",
  });
  const abcSchool = await schools.createSchools({
    name: "ABC International",
    code: "ABCI",
    city: "Pune",
    status: "active",
  });

  for (const school of [greenValley, abcSchool]) {
    for (const className of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      await schools.createSchoolClasses({
        school_id: school.id,
        class_name: className,
        academic_year_id: year.id,
        display_order: Number(className),
        status: "active",
      });
    }
  }

  await devices.registerDevice({
    device_code: "POS001",
    device_name: "Main Counter",
  });

  console.log("Seed complete. POS001 registration token in DB.");
}
