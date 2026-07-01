import mongoose, { Schema, Document as MongooseDocument } from "mongoose";
import bcrypt from "bcryptjs";

export type UserRole = "entrepreneur" | "investor";

export interface IUser extends MongooseDocument {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  avatarUrl: string;
  bio: string;
  isOnline: boolean;
  createdAt: string;
  comparePassword: (candidatePassword: string) => Promise<boolean>;
}

const toJSONTransform = {
  transform: (_doc: unknown, ret: Record<string, unknown>) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
};

const options = {
  discriminatorKey: "role",
  timestamps: false,
  toJSON: toJSONTransform,
  toObject: toJSONTransform,
};

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false }, // never return by default
    role: { type: String, enum: ["entrepreneur", "investor"], required: true },
    avatarUrl: { type: String, default: "" },
    bio: { type: String, default: "" },
    isOnline: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  options,
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Compare password method
userSchema.methods.comparePassword = async function (
  candidatePassword: string,
) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>("User", userSchema);

// ----- Entrepreneur discriminator -----
export interface IEntrepreneur extends IUser {
  startupName: string;
  pitchSummary: string;
  fundingNeeded: string;
  industry: string;
  location: string;
  foundedYear: number;
  teamSize: number;
}

const entrepreneurSchema = new Schema<IEntrepreneur>({
  startupName: { type: String, default: "" },
  pitchSummary: { type: String, default: "" },
  fundingNeeded: { type: String, default: "" },
  industry: { type: String, default: "" },
  location: { type: String, default: "" },
  foundedYear: { type: Number, default: new Date().getFullYear() },
  teamSize: { type: Number, default: 1 },
});

export const Entrepreneur = User.discriminator<IEntrepreneur>(
  "entrepreneur",
  entrepreneurSchema,
);

// ----- Investor discriminator -----
export interface IInvestor extends IUser {
  investmentInterests: string[];
  investmentStage: string[];
  portfolioCompanies: string[];
  totalInvestments: number;
  minimumInvestment: string;
  maximumInvestment: string;
}

const investorSchema = new Schema<IInvestor>({
  investmentInterests: { type: [String], default: [] },
  investmentStage: { type: [String], default: [] },
  portfolioCompanies: { type: [String], default: [] },
  totalInvestments: { type: Number, default: 0 },
  minimumInvestment: { type: String, default: "" },
  maximumInvestment: { type: String, default: "" },
});

export const Investor = User.discriminator<IInvestor>(
  "investor",
  investorSchema,
);
