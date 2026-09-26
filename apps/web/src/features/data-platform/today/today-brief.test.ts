import { describe, expect, it } from "vitest";
import { demoFixtureForScope } from "../demo/demo-data";
import { buildTodayBrief } from "./today-brief";

describe("Today presentation adapter", () => {
 it("renders Go decisions without reevaluating against the browser clock", () => {
  const fixture=demoFixtureForScope();
  const input={publicDashboard:fixture.publicDashboard,summaryTiles:[],language:"en" as const};
  const brief=buildTodayBrief({...input,now:Date.parse("2099-01-01T00:00:00Z")});
  expect(brief?.recommendationMode).toBe("live");
  expect(brief?.topActions).toEqual(fixture.publicDashboard.decision?.top_actions);
  expect(brief?.planItems).toEqual(fixture.publicDashboard.decision?.plan_items);
 });
 it("fails closed without a decision payload", () => {
  const fixture=demoFixtureForScope();
  expect(buildTodayBrief({publicDashboard:{...fixture.publicDashboard,decision:undefined},summaryTiles:[],language:"en"})).toBeNull();
 });
 it("localizes the headline selected by Go", () => {
  const fixture=demoFixtureForScope();const decision=fixture.publicDashboard.decision!;
  const action={...fixture.publicDashboard.top_actions[0],id:"urgent",title:"Leave earlier",title_zh:"提前出发"};
  const brief=buildTodayBrief({publicDashboard:{...fixture.publicDashboard,decision:{...decision,top_actions:[action],headline_action_id:"urgent",has_scoped_data:true}},summaryTiles:[],language:"zh"});
  expect(brief?.headline).toBe("提前出发");expect(brief?.topActions[0].title).toBe("Leave earlier");
 });
 it("does not describe an actionless live brief as all clear", () => {
  const fixture = demoFixtureForScope();
  const decision = fixture.publicDashboard.decision!;
  const brief = buildTodayBrief({
   publicDashboard: {
    ...fixture.publicDashboard,
    decision: {...decision, has_scoped_data: true, top_actions: [], headline_action_id: ""},
   },
   summaryTiles: [],
   language: "en",
  });
  expect(brief?.headline).toBe("No current recommendation");
 });
 it("keeps missing historical snapshots read-only", () => {
  const fixture=demoFixtureForScope({date:"2026-08-07"});
  const brief=buildTodayBrief({publicDashboard:fixture.publicDashboard,summaryTiles:[],language:"en"});
  expect(brief?.historicalSnapshotAvailable).toBe(false);expect(brief?.topActions).toEqual([]);expect(brief?.checkedAt).toBeNull();
 });
});
