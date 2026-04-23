import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  meters: defineTable({
    name: v.string(),
    type: v.union(v.literal("power"), v.literal("water")),
  }),
  readings: defineTable({
    meterId: v.id("meters"),
    amount: v.number(), 
    units: v.number(),  
    date: v.number(),   
  }).index("by_meter", ["meterId"]),
  
  pawnShops: defineTable({
    name: v.string(),
    location: v.optional(v.string()),
  }),
  
  pawnSlips: defineTable({
    shopId: v.id("pawnShops"),
    pawnedDate: v.number(),
    repaymentDate: v.number(),
    totalPawnAmount: v.number(),
    totalRepaymentAmount: v.number(),
    status: v.union(v.literal("active"), v.literal("redeemed"), v.literal("expired")),
    redeemedDate: v.optional(v.number()),
    items: v.array(v.object({
      description: v.string(),
      amount: v.number(),
    })),
  }).index("by_status", ["status"]),
});
