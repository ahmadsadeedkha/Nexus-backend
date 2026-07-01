import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { User, Entrepreneur, Investor } from "./models/User";
import { CollaborationRequest } from "./models/CollaborationRequest";
import { Message } from "./models/Message";
import bcrypt from "bcryptjs";

const MONGO_URI = process.env.MONGO_URI as string;

const seed = async () => {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  // Clear existing data
  await User.deleteMany({});
  await CollaborationRequest.deleteMany({});
  await Message.deleteMany({});
  console.log("Cleared existing data");

  // ── Entrepreneurs ──────────────────────────────────────────────
  const sarah = await Entrepreneur.create({
    name: "Sarah Johnson",
    email: "sarah@techwave.io",
    password: "password123",
    role: "entrepreneur",
    avatarUrl:
      "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg",
    bio: "Serial entrepreneur with 10+ years of experience in SaaS and fintech.",
    isOnline: true,
    startupName: "TechWave AI",
    pitchSummary:
      "AI-powered financial analytics platform helping SMBs make data-driven decisions.",
    fundingNeeded: "$1.5M",
    industry: "FinTech",
    location: "San Francisco, CA",
    foundedYear: 2021,
    teamSize: 12,
  });

  const david = await Entrepreneur.create({
    name: "David Chen",
    email: "david@greenlife.co",
    password: "password123",
    role: "entrepreneur",
    avatarUrl:
      "https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg",
    bio: "Environmental scientist turned entrepreneur. Passionate about sustainable solutions.",
    isOnline: false,
    startupName: "GreenLife Solutions",
    pitchSummary:
      "Biodegradable packaging alternatives for consumer goods and food industry.",
    fundingNeeded: "$2M",
    industry: "CleanTech",
    location: "Portland, OR",
    foundedYear: 2020,
    teamSize: 8,
  });

  const maya = await Entrepreneur.create({
    name: "Maya Patel",
    email: "maya@healthpulse.com",
    password: "password123",
    role: "entrepreneur",
    avatarUrl:
      "https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg",
    bio: "Former healthcare professional with an MBA. Building tech to improve patient care.",
    isOnline: true,
    startupName: "HealthPulse",
    pitchSummary:
      "Mobile platform connecting patients with mental health professionals in real-time.",
    fundingNeeded: "$800K",
    industry: "HealthTech",
    location: "Boston, MA",
    foundedYear: 2022,
    teamSize: 5,
  });

  const james = await Entrepreneur.create({
    name: "James Wilson",
    email: "james@urbanfarm.io",
    password: "password123",
    role: "entrepreneur",
    avatarUrl:
      "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg",
    bio: "Agricultural engineer focused on urban farming solutions and food security.",
    isOnline: false,
    startupName: "UrbanFarm",
    pitchSummary:
      "IoT-enabled vertical farming systems for urban environments and food deserts.",
    fundingNeeded: "$3M",
    industry: "AgTech",
    location: "Chicago, IL",
    foundedYear: 2019,
    teamSize: 14,
  });

  console.log("Entrepreneurs created");

  // ── Investors ──────────────────────────────────────────────────
  const michael = await Investor.create({
    name: "Michael Rodriguez",
    email: "michael@vcinnovate.com",
    password: "password123",
    role: "investor",
    avatarUrl:
      "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg",
    bio: "Early-stage investor with focus on B2B SaaS and fintech. Previously founded and exited two startups.",
    isOnline: true,
    investmentInterests: ["FinTech", "SaaS", "AI/ML"],
    investmentStage: ["Seed", "Series A"],
    portfolioCompanies: ["PayStream", "DataSense", "CloudSecure"],
    totalInvestments: 12,
    minimumInvestment: "$250K",
    maximumInvestment: "$1.5M",
  });

  const jennifer = await Investor.create({
    name: "Jennifer Lee",
    email: "jennifer@impactvc.org",
    password: "password123",
    role: "investor",
    avatarUrl:
      "https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg",
    bio: "Impact investor focused on climate tech, sustainable agriculture, and clean energy.",
    isOnline: false,
    investmentInterests: ["CleanTech", "AgTech", "Sustainability"],
    investmentStage: ["Seed", "Series A", "Series B"],
    portfolioCompanies: ["SolarFlow", "EcoPackage", "CleanWater Solutions"],
    totalInvestments: 18,
    minimumInvestment: "$500K",
    maximumInvestment: "$3M",
  });

  const robert = await Investor.create({
    name: "Robert Torres",
    email: "robert@healthventures.com",
    password: "password123",
    role: "investor",
    avatarUrl:
      "https://images.pexels.com/photos/834863/pexels-photo-834863.jpeg",
    bio: "Healthcare-focused investor with medical background. Looking for innovations in patient care and biotech.",
    isOnline: true,
    investmentInterests: ["HealthTech", "BioTech", "Medical Devices"],
    investmentStage: ["Series A", "Series B"],
    portfolioCompanies: ["MediTrack", "BioGenics", "Patient+"],
    totalInvestments: 9,
    minimumInvestment: "$1M",
    maximumInvestment: "$5M",
  });

  console.log("Investors created");

  // ── Collaboration Requests ─────────────────────────────────────
  await CollaborationRequest.create([
    {
      investorId: michael._id,
      entrepreneurId: sarah._id,
      message:
        "I'd like to explore potential investment in TechWave AI. Your AI-driven financial analytics platform aligns well with my investment thesis.",
      status: "pending",
    },
    {
      investorId: jennifer._id,
      entrepreneurId: sarah._id,
      message:
        "Interested in discussing how TechWave AI can incorporate sustainable practices. Let's connect to explore potential collaboration.",
      status: "accepted",
    },
    {
      investorId: robert._id,
      entrepreneurId: maya._id,
      message:
        "Your HealthPulse platform addresses a critical need in mental healthcare. I'd like to learn more about your traction and roadmap.",
      status: "pending",
    },
    {
      investorId: jennifer._id,
      entrepreneurId: david._id,
      message:
        "GreenLife's biodegradable packaging solutions align with my focus on sustainable investments. Let's discuss scaling possibilities.",
      status: "accepted",
    },
    {
      investorId: michael._id,
      entrepreneurId: james._id,
      message:
        "Your UrbanFarm concept is fascinating. I'm interested in learning more about your IoT implementation and market validation.",
      status: "rejected",
    },
  ]);

  console.log("Collaboration requests created");

  // ── Messages ───────────────────────────────────────────────────
  await Message.create([
    {
      senderId: sarah._id,
      receiverId: michael._id,
      content:
        "Thanks for connecting. I'd love to discuss how our AI platform can revolutionize financial analytics for SMBs.",
      isRead: true,
    },
    {
      senderId: michael._id,
      receiverId: sarah._id,
      content:
        "I'm interested in learning more about your tech stack and ML models. Are you available for a call this week?",
      isRead: true,
    },
    {
      senderId: sarah._id,
      receiverId: michael._id,
      content:
        "Absolutely! I can walk you through our technology and current traction. How does Thursday at 2pm PT work?",
      isRead: true,
    },
    {
      senderId: michael._id,
      receiverId: sarah._id,
      content:
        "Thursday works great. I'll send a calendar invite. Looking forward to it!",
      isRead: false,
    },
    {
      senderId: jennifer._id,
      receiverId: maya._id,
      content:
        "I saw your pitch for HealthPulse and I'm intrigued by your approach to mental healthcare accessibility.",
      isRead: true,
    },
    {
      senderId: maya._id,
      receiverId: jennifer._id,
      content:
        "Thank you, Jennifer! Mental health services need to be more accessible, especially in underserved communities.",
      isRead: true,
    },
    {
      senderId: jennifer._id,
      receiverId: maya._id,
      content:
        "I completely agree. Could you share more about your user acquisition strategy and current metrics?",
      isRead: false,
    },
    {
      senderId: david._id,
      receiverId: robert._id,
      content:
        "Hello Robert, I noticed you invest in healthcare. While GreenLife is focused on sustainable packaging, we have some applications in medical supplies.",
      isRead: true,
    },
    {
      senderId: robert._id,
      receiverId: david._id,
      content:
        "Interesting crossover, David. I'd be interested in learning more about your biodegradable materials and how they could be used in healthcare.",
      isRead: true,
    },
    {
      senderId: david._id,
      receiverId: robert._id,
      content:
        "Great! We've been developing materials that can safely package medical devices while being eco-friendly. Our tests show 40% less environmental impact.",
      isRead: false,
    },
  ]);

  console.log("Messages created");

  console.log("\n✅ Seed complete! Credentials for all accounts: password123");
  console.log(
    "Entrepreneurs: sarah@techwave.io, david@greenlife.co, maya@healthpulse.com, james@urbanfarm.io",
  );
  console.log(
    "Investors: michael@vcinnovate.com, jennifer@impactvc.org, robert@healthventures.com",
  );

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
