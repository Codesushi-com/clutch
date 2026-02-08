/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _helpers from "../_helpers.js";
import type * as analytics from "../analytics.js";
import type * as chats from "../chats.js";
import type * as comments from "../comments.js";
import type * as events from "../events.js";
import type * as featureBuilder from "../featureBuilder.js";
import type * as gate from "../gate.js";
import type * as metrics from "../metrics.js";
import type * as modelAnalytics from "../modelAnalytics.js";
import type * as modelPricing from "../modelPricing.js";
import type * as notifications from "../notifications.js";
import type * as projects from "../projects.js";
import type * as promptMetrics from "../promptMetrics.js";
import type * as promptVersions from "../promptVersions.js";
import type * as roadmap from "../roadmap.js";
import type * as seed from "../seed.js";
import type * as sessions from "../sessions.js";
import type * as signals from "../signals.js";
import type * as stuckTickets from "../stuckTickets.js";
import type * as taskAnalyses from "../taskAnalyses.js";
import type * as taskDependencies from "../taskDependencies.js";
import type * as task_events from "../task_events.js";
import type * as tasks from "../tasks.js";
import type * as triage from "../triage.js";
import type * as workLoop from "../workLoop.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _helpers: typeof _helpers;
  analytics: typeof analytics;
  chats: typeof chats;
  comments: typeof comments;
  events: typeof events;
  featureBuilder: typeof featureBuilder;
  gate: typeof gate;
  metrics: typeof metrics;
  modelAnalytics: typeof modelAnalytics;
  modelPricing: typeof modelPricing;
  notifications: typeof notifications;
  projects: typeof projects;
  promptMetrics: typeof promptMetrics;
  promptVersions: typeof promptVersions;
  roadmap: typeof roadmap;
  seed: typeof seed;
  sessions: typeof sessions;
  signals: typeof signals;
  stuckTickets: typeof stuckTickets;
  taskAnalyses: typeof taskAnalyses;
  taskDependencies: typeof taskDependencies;
  task_events: typeof task_events;
  tasks: typeof tasks;
  triage: typeof triage;
  workLoop: typeof workLoop;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
