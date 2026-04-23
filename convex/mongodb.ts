"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { MongoClient, ObjectId } from "mongodb";

type MeterDocument = {
  _id: { toString(): string };
  name?: string;
  type?: string;
  meterNumber?: string;
  createdAt?: number;
};

type ReadingDocument = {
  _id: { toString(): string };
  meterId?: string;
  amount?: number;
  units?: number;
  date?: number;
};

type PawnSlipDocument = {
  _id: { toString(): string };
  shopName?: string;
  slipNumber?: string;
  pawnAmount?: number;
  repayAmount?: number;
  repayDate?: number;
  items?: Array<{ description?: string }>;
  status?: string;
  pawnedDate?: number;
  redeemedDate?: number;
};

let mongoClient: MongoClient | null = null;

async function getDb() {
  const url = process.env.MONGO_URL || process.env.MONGODB_URL;
  if (!url) {
    throw new Error("Set MONGODB_URL or MONGO_URL in Convex environment variables");
  }
  if (!mongoClient) {
    mongoClient = new MongoClient(url);
    await mongoClient.connect();
  }
  return mongoClient.db("Power-H20-DB");
}

function serializeMeter(doc: MeterDocument) {
  return {
    _id: doc._id.toString(),
    name: doc.name ?? "Unnamed meter",
    type: doc.type ?? "unknown",
    meterNumber: doc.meterNumber ?? null,
    createdAt: doc.createdAt ?? null,
  };
}

function serializeReading(doc: ReadingDocument) {
  return {
    _id: doc._id.toString(),
    meterId: doc.meterId ?? "",
    amount: doc.amount ?? 0,
    units: doc.units ?? 0,
    date: doc.date ?? null,
  };
}

function serializePawnSlip(doc: PawnSlipDocument) {
  return {
    _id: doc._id.toString(),
    shopName: doc.shopName ?? "",
    slipNumber: doc.slipNumber ?? null,
    pawnAmount: doc.pawnAmount ?? 0,
    repayAmount: doc.repayAmount ?? 0,
    repayDate: doc.repayDate ?? 0,
    items: (doc.items ?? []).map((item) => ({
      description: item.description ?? "",
    })),
    status: doc.status ?? "active",
    pawnedDate: doc.pawnedDate ?? null,
    redeemedDate: doc.redeemedDate ?? null,
  };
}

export const listMeters = action({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      name: v.string(),
      type: v.string(),
      meterNumber: v.union(v.string(), v.null()),
      createdAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (_ctx) => {
    const db = await getDb();
    const meters = (await db.collection("meters").find({}).toArray()) as Array<MeterDocument>;
    return meters.map(serializeMeter);
  },
});

export const createMeter = action({
  args: { name: v.string(), type: v.string(), meterNumber: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const db = await getDb();
    const result = await db.collection("meters").insertOne({
      name: args.name,
      type: args.type,
      meterNumber: args.meterNumber,
      createdAt: Date.now(),
    });
    return result.insertedId.toString();
  },
});

export const addReading = action({
  args: { meterId: v.string(), amount: v.number(), units: v.number() },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const db = await getDb();
    const result = await db.collection("readings").insertOne({
      meterId: args.meterId,
      amount: args.amount,
      units: args.units,
      date: Date.now(),
    });
    return result.insertedId.toString();
  },
});

export const getReadings = action({
  args: { meterId: v.string() },
  returns: v.array(
    v.object({
      _id: v.string(),
      meterId: v.string(),
      amount: v.number(),
      units: v.number(),
      date: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (_ctx, args) => {
    const db = await getDb();
    const readings = (await db
      .collection("readings")
      .find({ meterId: args.meterId })
      .sort({ date: -1 })
      .toArray()) as Array<ReadingDocument>;
    return readings.map(serializeReading);
  },
});

export const createPawnSlip = action({
  args: {
    shopName: v.string(),
    slipNumber: v.string(),
    pawnAmount: v.number(),
    repayAmount: v.number(),
    repayDate: v.number(),
    items: v.array(v.object({ description: v.string() })),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const db = await getDb();
    const result = await db.collection("pawn_slips").insertOne({
      ...args,
      status: "active",
      pawnedDate: Date.now(),
    });
    return result.insertedId.toString();
  },
});

export const listActivePawnSlips = action({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      shopName: v.string(),
      slipNumber: v.union(v.string(), v.null()),
      pawnAmount: v.number(),
      repayAmount: v.number(),
      repayDate: v.number(),
      items: v.array(v.object({ description: v.string() })),
      status: v.string(),
      pawnedDate: v.union(v.number(), v.null()),
      redeemedDate: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (_ctx) => {
    const db = await getDb();
    const pawnSlips = (await db
      .collection("pawn_slips")
      .find({ status: "active" })
      .toArray()) as Array<PawnSlipDocument>;
    return pawnSlips.map(serializePawnSlip);
  },
});

export const redeemPawnSlip = action({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const db = await getDb();
    await db.collection("pawn_slips").updateOne(
      { _id: new ObjectId(args.id) },
      { $set: { status: "redeemed", redeemedDate: Date.now() } },
    );
    return null;
  },
});
