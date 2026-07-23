"use client";

import { useCallback, useState } from "react";
import type { ProfileInput } from "@/lib/db/profiles";
import type { UserType } from "./UserTypeStep";
import {
  CheckboxGroup,
  PrimaryButton,
  RadioGroup,
  SelectField,
  TextField,
  YesNoToggle,
  type Option,
} from "./ui";

// ─── Option sets (ported verbatim from sumobots StudentDetailsForm) ──────────
const YEAR_OPTIONS: Option[] = [
  { value: "1st Year", label: "1st Year" },
  { value: "2nd Year", label: "2nd Year" },
  { value: "3rd Year", label: "3rd Year" },
  { value: "4th Year", label: "4th Year" },
  { value: "5th Year+", label: "5th Year+" },
];

const DEGREE_STAGE_OPTIONS: Option[] = [
  { value: "Pre-penultimate", label: "Pre-penultimate (3rd-last year or earlier)" },
  { value: "Penultimate", label: "Penultimate (2nd-last year)" },
  { value: "Final Year", label: "Final year" },
];

const UNDERGRAD_POSTGRAD_OPTIONS: Option[] = [
  { value: "Undergraduate", label: "Undergraduate" },
  { value: "Postgraduate", label: "Postgraduate" },
];

const DOMESTIC_INTL_OPTIONS: Option[] = [
  { value: "Domestic", label: "Domestic" },
  { value: "International", label: "International" },
];

const FACULTY_OPTIONS: Option[] = [
  { value: "Arts, Design & Architecture", label: "Arts, Design & Architecture" },
  { value: "Business", label: "Business" },
  { value: "Engineering", label: "Engineering" },
  { value: "Law & Justice", label: "Law & Justice" },
  { value: "Medicine & Health", label: "Medicine & Health" },
  { value: "Science", label: "Science" },
  { value: "Other", label: "Other" },
];

const GENDER_OPTIONS: Option[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non-binary", label: "Non-binary" },
  { value: "other", label: "Other" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
];

const HEARD_FROM_OPTIONS: Option[] = [
  { value: "discord", label: "Discord" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "poster", label: "Poster" },
  { value: "friend", label: "Friend" },
  { value: "other", label: "Other" },
];

type FieldErrors = Record<string, string>;

export default function DetailsForm({
  userType,
  onComplete,
  submitting,
}: {
  userType: UserType;
  onComplete: (input: ProfileInput) => void;
  submitting?: boolean;
}) {
  const isUnsw = userType === "unsw";
  const isHighSchool = userType === "high_school";
  const isOtherUni = userType === "other_uni";

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [degreeStage, setDegreeStage] = useState("");
  const [undergradPostgrad, setUndergradPostgrad] = useState("");
  const [domesticIntl, setDomesticIntl] = useState("");
  const [selectedFaculties, setSelectedFaculties] = useState<string[]>([]);
  const [facultyOther, setFacultyOther] = useState("");
  const [gender, setGender] = useState("");
  const [genderOther, setGenderOther] = useState("");
  const [isRamsocMember, setIsRamsocMember] = useState(false);
  const [isArcMember, setIsArcMember] = useState(false);
  const [heardFrom, setHeardFrom] = useState("");
  const [heardFromOther, setHeardFromOther] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validateField = useCallback(
    (name: string, value: string) => {
      setFieldErrors((prev) => {
        const next = { ...prev };
        switch (name) {
          case "full_name":
            if (!value.trim()) next.full_name = "Full name is required";
            else delete next.full_name;
            break;
          case "zid":
            if (!value.trim()) next.zid = "zID is required";
            else if (!/^z\d{7}$/.test(value)) next.zid = "Format: z1234567";
            else delete next.zid;
            break;
          case "university":
            if (!value.trim()) next.university = "University is required";
            else delete next.university;
            break;
          case "uni_id":
            if (!value.trim()) next.uni_id = "University ID is required";
            else delete next.uni_id;
            break;
          case "high_school":
            if (!value.trim()) next.high_school = "High school is required";
            else delete next.high_school;
            break;
          case "year_of_study":
            if (!value) next.year_of_study = "Year of study is required";
            else delete next.year_of_study;
            break;
          case "degree_stage":
            if (!value) next.degree_stage = "Degree stage is required";
            else delete next.degree_stage;
            break;
          case "undergrad_postgrad":
            if (!value) next.undergrad_postgrad = "This field is required";
            else delete next.undergrad_postgrad;
            break;
          case "domestic_international":
            if (!value) next.domestic_international = "This field is required";
            else delete next.domestic_international;
            break;
          case "degree":
            if (!value.trim()) next.degree = "Degree is required";
            else delete next.degree;
            break;
          case "faculty":
            break;
          case "faculty_other":
            if (selectedFaculties.includes("Other") && !value.trim())
              next.faculty_other = "Please specify your faculty";
            else delete next.faculty_other;
            break;
          case "gender":
            if (!value) next.gender = "Gender is required";
            else delete next.gender;
            break;
          case "gender_other":
            if (gender === "other" && !value.trim()) next.gender_other = "Please specify";
            else delete next.gender_other;
            break;
          case "heard_from":
            if (!value) next.heard_from = "This field is required";
            else delete next.heard_from;
            break;
          case "heard_from_other":
            if (heardFrom === "other" && !value.trim()) next.heard_from_other = "Please specify";
            else delete next.heard_from_other;
            break;
          case "phone":
            if (!value.trim()) next.phone = "Phone number is required";
            else delete next.phone;
            break;
        }
        return next;
      });
    },
    [gender, selectedFaculties, heardFrom],
  );

  function handleBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    markTouched(name);
    validateField(name, value);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    if (touched[name]) validateField(name, value);
  }

  function validateAll(form: FormData): boolean {
    const errors: FieldErrors = {};

    const fullName = (form.get("full_name") as string) || "";
    if (!fullName.trim()) errors.full_name = "Full name is required";

    if (isUnsw) {
      const zid = (form.get("zid") as string) || "";
      if (!zid.trim()) errors.zid = "zID is required";
      else if (!/^z\d{7}$/.test(zid)) errors.zid = "Format: z1234567";
    } else if (isOtherUni) {
      const uni = (form.get("university") as string) || "";
      if (!uni.trim()) errors.university = "University is required";
      const uniId = (form.get("uni_id") as string) || "";
      if (!uniId.trim()) errors.uni_id = "University ID is required";
    } else if (isHighSchool) {
      const hs = (form.get("high_school") as string) || "";
      if (!hs.trim()) errors.high_school = "High school is required";
    }

    // University-specific fields only required for uni students
    if (!isHighSchool) {
      if (!yearOfStudy) errors.year_of_study = "Year of study is required";
      if (!degreeStage) errors.degree_stage = "Degree stage is required";
      if (!undergradPostgrad) errors.undergrad_postgrad = "This field is required";
      if (!domesticIntl) errors.domestic_international = "This field is required";

      const degree = (form.get("degree") as string) || "";
      if (!degree.trim()) errors.degree = "Degree is required";

      if (selectedFaculties.length === 0) errors.faculty = "Select at least one faculty";
      if (selectedFaculties.includes("Other") && !facultyOther.trim())
        errors.faculty_other = "Please specify your faculty";
    }

    if (!gender) errors.gender = "Gender is required";
    if (gender === "other" && !genderOther.trim()) errors.gender_other = "Please specify";

    if (!heardFrom) errors.heard_from = "This field is required";
    if (heardFrom === "other" && !heardFromOther.trim())
      errors.heard_from_other = "Please specify";

    const phone = (form.get("phone") as string) || "";
    if (!phone.trim()) errors.phone = "Phone number is required";

    setFieldErrors(errors);
    setTouched({
      full_name: true,
      zid: true,
      university: true,
      uni_id: true,
      high_school: true,
      year_of_study: true,
      degree_stage: true,
      undergrad_postgrad: true,
      domestic_international: true,
      degree: true,
      faculty: true,
      faculty_other: true,
      gender: true,
      gender_other: true,
      heard_from: true,
      heard_from_other: true,
      phone: true,
    });

    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!validateAll(form)) return;

    const input: ProfileInput = {
      full_name: form.get("full_name") as string,
      user_type: userType,
      university: isUnsw ? "UNSW" : isOtherUni ? (form.get("university") as string) : "",
      zid: isUnsw ? (form.get("zid") as string) : "",
      uni_id: isOtherUni ? (form.get("uni_id") as string) : "",
      high_school: isHighSchool ? (form.get("high_school") as string) : "",
      year_of_study: isHighSchool ? "" : yearOfStudy,
      degree_stage: isHighSchool ? "" : degreeStage,
      undergrad_postgrad: isHighSchool ? "" : undergradPostgrad,
      domestic_international: isHighSchool ? "" : domesticIntl,
      degree: isHighSchool ? "" : ((form.get("degree") as string) || ""),
      majors: isHighSchool ? "" : ((form.get("majors") as string) || ""),
      faculty: isHighSchool
        ? ""
        : selectedFaculties.map((f) => (f === "Other" ? facultyOther.trim() : f)).join(", "),
      gender: gender,
      gender_other: gender === "other" ? genderOther : "",
      is_ramsoc_member: isUnsw && isRamsocMember,
      is_arc_member: isUnsw && isArcMember,
      heard_from: heardFrom,
      heard_from_other: heardFrom === "other" ? heardFromOther : "",
      phone: (form.get("phone") as string) || "",
    };

    onComplete(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="mb-2 text-2xl">Your details</h2>
        <p className="text-sm text-foreground/50">
          We couldn&apos;t find an existing registration for your email, so tell us about yourself.
        </p>
      </div>

      <TextField
        label="Full Name"
        name="full_name"
        required
        autoComplete="name"
        onBlur={handleBlur}
        onChange={handleChange}
        error={touched.full_name ? fieldErrors.full_name : undefined}
      />

      {isUnsw && (
        <TextField
          label="zID"
          name="zid"
          placeholder="z1234567"
          required
          onBlur={handleBlur}
          onChange={handleChange}
          error={touched.zid ? fieldErrors.zid : undefined}
        />
      )}

      {isOtherUni && (
        <>
          <TextField
            label="University"
            name="university"
            required
            placeholder="e.g. University of Sydney"
            onBlur={handleBlur}
            onChange={handleChange}
            error={touched.university ? fieldErrors.university : undefined}
          />
          <TextField
            label="University ID"
            name="uni_id"
            required
            placeholder="e.g. 490123456"
            onBlur={handleBlur}
            onChange={handleChange}
            error={touched.uni_id ? fieldErrors.uni_id : undefined}
          />
        </>
      )}

      {isHighSchool && (
        <TextField
          label="High School"
          name="high_school"
          required
          placeholder="e.g. Sydney Grammar School"
          onBlur={handleBlur}
          onChange={handleChange}
          error={touched.high_school ? fieldErrors.high_school : undefined}
        />
      )}

      {!isHighSchool && (
        <>
          <SelectField
            label="Year of Study"
            name="year_of_study"
            options={YEAR_OPTIONS}
            placeholder="Select year"
            required
            value={yearOfStudy}
            onChange={(e) => {
              setYearOfStudy(e.target.value);
              markTouched("year_of_study");
              validateField("year_of_study", e.target.value);
            }}
            error={touched.year_of_study ? fieldErrors.year_of_study : undefined}
          />

          <SelectField
            label="Degree Stage"
            name="degree_stage"
            options={DEGREE_STAGE_OPTIONS}
            placeholder="Select degree stage"
            required
            value={degreeStage}
            onChange={(e) => {
              setDegreeStage(e.target.value);
              markTouched("degree_stage");
              validateField("degree_stage", e.target.value);
            }}
            error={touched.degree_stage ? fieldErrors.degree_stage : undefined}
          />

          <RadioGroup
            label="Undergraduate or Postgraduate"
            name="undergrad_postgrad"
            options={UNDERGRAD_POSTGRAD_OPTIONS}
            value={undergradPostgrad}
            onChange={(val) => {
              setUndergradPostgrad(val);
              markTouched("undergrad_postgrad");
              validateField("undergrad_postgrad", val);
            }}
            error={touched.undergrad_postgrad ? fieldErrors.undergrad_postgrad : undefined}
            required
          />

          <RadioGroup
            label="Domestic or International"
            name="domestic_international"
            options={DOMESTIC_INTL_OPTIONS}
            value={domesticIntl}
            onChange={(val) => {
              setDomesticIntl(val);
              markTouched("domestic_international");
              validateField("domestic_international", val);
            }}
            error={touched.domestic_international ? fieldErrors.domestic_international : undefined}
            required
          />

          <TextField
            label="Degree"
            name="degree"
            required
            placeholder="e.g. B.Eng (Mechatronics)"
            onBlur={handleBlur}
            onChange={handleChange}
            error={touched.degree ? fieldErrors.degree : undefined}
          />

          <TextField label="Majors (if applicable)" name="majors" placeholder="e.g. Mechanical Engineering" />

          <CheckboxGroup
            label="Faculty"
            options={FACULTY_OPTIONS}
            selected={selectedFaculties}
            onChange={(vals) => {
              setSelectedFaculties(vals);
              markTouched("faculty");
              setFieldErrors((prev) => {
                const next = { ...prev };
                if (vals.length === 0) next.faculty = "Select at least one faculty";
                else delete next.faculty;
                if (!vals.includes("Other")) {
                  setFacultyOther("");
                  delete next.faculty_other;
                }
                return next;
              });
            }}
            error={touched.faculty ? fieldErrors.faculty : undefined}
            required
          />

          {selectedFaculties.includes("Other") && (
            <TextField
              label="Please specify your faculty"
              name="faculty_other"
              required
              value={facultyOther}
              onChange={(e) => {
                setFacultyOther(e.target.value);
                if (touched.faculty_other) validateField("faculty_other", e.target.value);
              }}
              onBlur={(e) => {
                markTouched("faculty_other");
                validateField("faculty_other", e.target.value);
              }}
              error={touched.faculty_other ? fieldErrors.faculty_other : undefined}
            />
          )}
        </>
      )}

      <RadioGroup
        label="Gender"
        name="gender"
        options={GENDER_OPTIONS}
        value={gender}
        onChange={(val) => {
          setGender(val);
          markTouched("gender");
          validateField("gender", val);
          if (val !== "other") {
            setGenderOther("");
            setFieldErrors((prev) => {
              const next = { ...prev };
              delete next.gender_other;
              return next;
            });
          }
        }}
        error={touched.gender ? fieldErrors.gender : undefined}
        required
      />

      {gender === "other" && (
        <TextField
          label="Please specify"
          name="gender_other"
          required
          value={genderOther}
          onChange={(e) => {
            setGenderOther(e.target.value);
            if (touched.gender_other) validateField("gender_other", e.target.value);
          }}
          onBlur={(e) => {
            markTouched("gender_other");
            validateField("gender_other", e.target.value);
          }}
          error={touched.gender_other ? fieldErrors.gender_other : undefined}
        />
      )}

      {isUnsw && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-foreground/70">Memberships</span>
          <YesNoToggle label="I am a RAMSoc member" value={isRamsocMember} onChange={setIsRamsocMember} />
          <YesNoToggle label="I am an Arc member" value={isArcMember} onChange={setIsArcMember} />
        </div>
      )}

      <SelectField
        label="How did you hear about us?"
        name="heard_from"
        options={HEARD_FROM_OPTIONS}
        placeholder="Select an option"
        required
        value={heardFrom}
        onChange={(e) => {
          setHeardFrom(e.target.value);
          markTouched("heard_from");
          validateField("heard_from", e.target.value);
          if (e.target.value !== "other") {
            setHeardFromOther("");
            setFieldErrors((prev) => {
              const next = { ...prev };
              delete next.heard_from_other;
              return next;
            });
          }
        }}
        error={touched.heard_from ? fieldErrors.heard_from : undefined}
      />

      {heardFrom === "other" && (
        <TextField
          label="Please specify"
          name="heard_from_other"
          required
          value={heardFromOther}
          onChange={(e) => {
            setHeardFromOther(e.target.value);
            if (touched.heard_from_other) validateField("heard_from_other", e.target.value);
          }}
          onBlur={(e) => {
            markTouched("heard_from_other");
            validateField("heard_from_other", e.target.value);
          }}
          error={touched.heard_from_other ? fieldErrors.heard_from_other : undefined}
        />
      )}

      <TextField
        label="Phone Number"
        name="phone"
        type="tel"
        required
        autoComplete="tel"
        placeholder="04XX XXX XXX"
        onBlur={handleBlur}
        onChange={handleChange}
        error={touched.phone ? fieldErrors.phone : undefined}
      />

      <div className="mt-2">
        <PrimaryButton type="submit" loading={submitting}>
          Continue
        </PrimaryButton>
      </div>
    </form>
  );
}
