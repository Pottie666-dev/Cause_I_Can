import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listMeters = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("meters"),
      _creationTime: v.number(),
      name: v.string(),
      type: v.union(v.literal("power"), v.literal("water")),
    })
  ),
  handler: async (ctx) => {
    return await ctx.db.query("meters").collect();
  },
});

export const createMeter = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal("power"), v.literal("water")),
  },
  returns: v.id("meters"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("meters", {
      name: args.name,
      type: args.type,
    });
  },
});

export const addReading = mutation({
  args: {
    meterId: v.id("meters"),
    amount: v.number(),
    units: v.number(),
    date: v.number(),
  },
  returns: v.id("readings"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("readings", {
      meterId: args.meterId,
      amount: args.amount,
      units: args.units,
      date: args.date,
    });
  },
});

export const getReadings = query({
  args: { meterId: v.id("meters") },
  returns: v.array(
    v.object({
      _id: v.id("readings"),
      _creationTime: v.number(),
      meterId: v.id("meters"),
      amount: v.number(),
      units: v.number(),
      date: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("readings")
      .withIndex("by_meter", (q) => q.eq("meterId", args.meterId))
      .order("desc")
      .collect();
  },
});
