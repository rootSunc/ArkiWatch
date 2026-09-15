import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
const headers={cookie:"arkiwatch_session=token-123",origin:"http://localhost"};
const url="http://localhost/api/personal/context";
afterEach(()=>vi.unstubAllGlobals());
describe("personal context transport",()=>{
 it("requires a session",async()=>{expect((await GET(new NextRequest(url))).status).toBe(401);});
 it("rejects cross-site requests before contacting Go",async()=>{
  const fetchMock=vi.fn();vi.stubGlobal("fetch",fetchMock);
  expect((await GET(new NextRequest(url,{headers:{...headers,origin:"https://evil.example"}}))).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it("forwards the Go aggregate with one authenticated request",async()=>{
  const body={locations:[{id:"loc-1"}],preferences:null,commuteProfiles:[],channels:[]};
  const fetchMock=vi.fn().mockResolvedValue(Response.json(body));vi.stubGlobal("fetch",fetchMock);
  const response=await GET(new NextRequest(url,{headers}));expect(await response.json()).toEqual(body);
  expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/me\/context$/),expect.objectContaining({headers:expect.objectContaining({Authorization:"Bearer token-123"})}));
 });
 it("forwards writes unchanged and preserves Go ownership rejection",async()=>{
  const fetchMock=vi.fn().mockResolvedValue(Response.json({detail:"Authenticated user cannot modify another user's resources."},{status:403}));vi.stubGlobal("fetch",fetchMock);
  const body=JSON.stringify({resource:"locations",payload:{user_id:"other-user",id:"loc-1"}});
  const response=await POST(new NextRequest(url,{method:"POST",headers,body}));expect(response.status).toBe(403);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/me\/context$/),expect.objectContaining({method:"POST",body}));
 });
 it("preserves resource validation messages",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({detail:"Location values are invalid."},{status:422})));
  const response=await POST(new NextRequest(url,{method:"POST",headers,body:"{}"}));expect(response.status).toBe(422);expect(await response.json()).toEqual({detail:"Location values are invalid."});
 });
 it("bounds backend failures and propagates cancellation",async()=>{
  const fetchMock=vi.fn().mockRejectedValue(new DOMException("Timed out","TimeoutError"));vi.stubGlobal("fetch",fetchMock);const controller=new AbortController();
  const response=await GET(new NextRequest(url,{headers,signal:controller.signal}));expect(response.status).toBe(502);
  controller.abort();expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
 });
 it("redacts internal server failures",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({detail:"internal database failure"},{status:500})));
  const response=await GET(new NextRequest(url,{headers}));expect(response.status).toBe(500);expect(await response.json()).toEqual({detail:"Personal context could not be loaded."});
 });
});
