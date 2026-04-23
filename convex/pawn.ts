import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listShops = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("pawnShops"),
    _creationTime: v.number(),
    name: v.string(),
    location: v.optional(v.string()),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("pawnShops").collect();
  },
});

export const createShop = mutation({
  args: { name: v.string(), location: v.optional(v.string()) },
  returns: v.id("pawnShops"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("pawnShops", { name: args.name, location: args.location });
  },
});

export const listActiveSlips = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("pawnSlips"),
    _creationTime: v.number(),
    shopId: v.id("pawnShops"),
    pawnedDate: v.number(),
    repaymentDate: v.number(),
    totalPawnAmount: v.number(),
    totalRepaymentAmount: v.number(),
    status: v.union(v.literal("active"), v.literal("redeemed"), v.literal("expired")),
    items: v.array(v.object({
      description: v.string(),
      amount: v.number(),
    })),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("pawnSlips")
      .withIndex("by_status", q => q.eq("status", "active"))
      .collect();
  },
});

export const createSlip = mutation({
  args: {
    shopId: v.id("pawnShops"),
    pawnedDate: v.number(),
    repaymentDate: v.number(),
    totalPawnAmount: v.number(),
    totalRepaymentAmount: v.number(),
    items: v.array(v.object({
      description: v.string(),
      amount: v.number(),
    })),
  },
  returns: v.id("pawnSlips"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("pawnSlips", {
      ...args,
      status: "active",
    });
  },
});

export const redeemSlip = mutation({
  args: { id: v.id("pawnSlips") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { 
      status: "redeemed",
      redeemedDate: Date.now()
    });
    return null;
  },
});

export const listHistory = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("pawnSlips"),
    _creationTime: v.number(),
    shopId: v.id("pawnShops"),
    pawnedDate: v.number(),
    repaymentDate: v.number(),
    redeemedDate: v.optional(v.number()),
    totalPawnAmount: v.number(),
    totalRepaymentAmount: v.number(),
    status: v.union(v.literal("active"), v.literal("redeemed"), v.literal("expired")),
    items: v.array(v.object({
      description: v.string(),
      amount: v.number(),
    })),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("pawnSlips")
      .withIndex("by_status", q => q.eq("status", "redeemed"))
      .order("desc")
      .take(10);
  },
});
