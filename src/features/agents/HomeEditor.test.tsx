import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AgentConfigOption, AgentProvider, NewAgentTask } from "@/bindings";
import { useProject } from "@/platform/project";
import { HomeEditor } from "./HomeEditor";
import { HOME, disconnect, savedDraft, updateComposer, useAgents } from "./store";

const backend = vi.hoisted(() => ({ providers: [] as AgentProvider[], create: vi.fn() }));
const ok = <T,>(data: T) => Promise.resolve({ status: "ok", data });
vi.mock("@/platform/ipc", async (original) => ({
  ...(await original<typeof import("@/platform/ipc")>()),
  commands: {
    agentProviders: () => ok(backend.providers),
    agentRefreshModels: (provider: string) =>
      ok({
        provider,
        config: backend.providers.find((p) => p.id === provider)?.config ?? [],
        thoughtLevels: backend.providers.find((p) => p.id === provider)?.thoughtLevels ?? {},
        refreshing: false,
        refreshedAtMs: Date.now(),
        retryAtMs: null,
        error: null,
      }),
    agentProbe: () => ok(null),
    vcsBranchInfo: () => ok({ head: "main" }),
    vcsBranches: () => ok([]),
    agentCreate: (req: NewAgentTask) => backend.create(req),
  },
}));
vi.mock("@/workbench/contributions", async (original) => ({
  ...(await original<typeof import("@/workbench/contributions")>()),
  maybeEditorService: () => ({ activePath: () => null }),
  editorService: () => ({ closeInput: () => false }),
}));

const option = (id: string, category: string, values: string[], current: string): AgentConfigOption => ({
  id,
  category,
  name: id === "model" ? "Model" : "Reasoning",
  description: null,
  current,
  via: "option",
  values: values.map((value) => ({ value, name: value, description: null })),
});

beforeEach(() => {
  disconnect();
  backend.create.mockReset().mockImplementation((req: NewAgentTask) => ok({ id: "new", config: req.config }));
  backend.providers = [
    {
      id: "fake",
      name: "Fake",
      command: "fake",
      program: "fake",
      args: [],
      defaultProgram: null,
      defaultArgs: [],
      loginHint: null,
      commandOverridden: false,
      commandEditable: true,
      commandReadOnlyReason: null,
      installed: true,
      env: {},
      commands: [],
      source: { kind: "custom" },
      config: [option("model", "model", ["big", "small", "plain", "unknown"], "big")],
      thoughtLevels: {
        big: [option("effort", "thought_level", ["low", "high"], "high")],
        small: [option("effort", "thought_level", ["minimal", "medium", "max"], "minimal")],
        plain: [],
      },
    },
  ];
  useAgents.setState({ providers: backend.providers, draft: savedDraft({ provider: "fake", config: {} }) });
  updateComposer(HOME, { text: "Check the project" });
});

async function chooseModel(model: string) {
  fireEvent.click(screen.getByRole("button", { name: "Model" }));
  fireEvent.click(screen.getByRole("option", { name: model }));
  fireEvent.pointerDown(document.body);
}

it("switches model-specific levels and restores each draft effort before starting", async () => {
  render(<HomeEditor />);
  expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("bighigh");
  await chooseModel("small");
  fireEvent.click(screen.getByRole("button", { name: "Model" }));
  fireEvent.click(screen.getByRole("button", { name: "Configure model" }));
  const effortGroup = screen.getByRole("radiogroup", { name: "Reasoning" });
  expect(within(effortGroup).getByRole("radio", { name: "minimal" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(within(effortGroup).getByRole("radio", { name: "medium" }));
  fireEvent.keyDown(document, { key: "Escape" });
  await chooseModel("big");
  expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("bighigh");
  await chooseModel("small");
  expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("smallmedium");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(backend.create).toHaveBeenCalled());
  expect(backend.create.mock.calls[0]![0].config).toEqual([
    { id: "model", value: "small" },
    { id: "effort", value: "medium" },
  ]);
});

it("defaults GitHub Copilot to maximum context window (1M) and highest effort across models", async () => {
  const copilot = {
    ...backend.providers[0]!,
    id: "copilot",
    name: "GitHub Copilot",
    config: [option("model", "model", ["gemini-4-carbon", "gpt-5.6-sol"], "gemini-4-carbon")],
    thoughtLevels: {
      "gemini-4-carbon": [
        option("reasoning_effort", "thought_level", ["low", "medium", "high"], "medium"),
        option("context_tier", "model_config", ["default", "long_context"], "default"),
      ],
      "gpt-5.6-sol": [
        option("reasoning_effort", "thought_level", ["low", "medium", "high", "xhigh", "max"], "medium"),
        option("context_tier", "model_config", ["default", "long_context"], "default"),
      ],
    },
  };
  useAgents.setState({ providers: [copilot], draft: savedDraft({ provider: "copilot", config: {} }) });
  render(<HomeEditor />);
  expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("gemini-4-carbonhigh · long_context");
  await chooseModel("gpt-5.6-sol");
  expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("gpt-5.6-solmax · long_context");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(backend.create).toHaveBeenCalled());
  expect(backend.create.mock.calls[0]![0].config).toEqual([
    { id: "model", value: "gpt-5.6-sol" },
    { id: "reasoning_effort", value: "max" },
    { id: "context_tier", value: "long_context" },
  ]);
});

it.each(["plain", "unknown"])("hides effort for %s models and sends no stale effort", async (model) => {
  render(<HomeEditor />);
  await chooseModel(model);
  expect(screen.getByRole("button", { name: "Model" })).toHaveAttribute("aria-haspopup", "dialog");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(backend.create).toHaveBeenCalled());
  expect(backend.create.mock.calls[0]![0].config).toEqual([{ id: "model", value: model }]);
});

it("sends the displayed remembered model and effort even when neither is changed", async () => {
  render(<HomeEditor />);
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(backend.create).toHaveBeenCalled());
  expect(backend.create.mock.calls[0]![0].config).toEqual([
    { id: "model", value: "big" },
    { id: "effort", value: "high" },
  ]);
});

it("ignores old provider-wide effort choices and refreshes unsupported per-model choices", async () => {
  useAgents.setState({
    draft: savedDraft({ provider: "fake", config: { effort: "low" }, thoughtLevels: { big: { effort: "removed" } } }),
  });
  render(<HomeEditor />);
  expect(screen.getByRole("button", { name: "Model" })).toHaveTextContent("bighigh");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  await waitFor(() => expect(backend.create).toHaveBeenCalled());
  expect(backend.create.mock.calls[0]![0].config).toContainEqual({ id: "effort", value: "high" });
});

it.each([
  [undefined, "full-access"],
  ["ask", undefined],
] as const)("with new-task approvals %s, sends mode %s", async (newTaskApprovals, mode) => {
  const provider = { ...backend.providers[0]!, config: [option("mode", "mode", ["ask", "full-access"], "ask")] };
  useAgents.setState({ providers: [provider] });
  const settings = useProject.getState().settings;
  useProject.setState({ settings: { ...settings, agents: { ...settings?.agents, newTaskApprovals } } as never });
  try {
    render(<HomeEditor />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(backend.create).toHaveBeenCalled());
    expect(backend.create.mock.calls[0]![0].config.find((c: { id: string }) => c.id === "mode")?.value).toBe(mode);
  } finally {
    useProject.setState({ settings });
  }
});
