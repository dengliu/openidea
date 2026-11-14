import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentConfigOption } from "@/bindings";
import { ConfigPickers, configPickerOptions } from "./ConfigPickers";

const config = (values: AgentConfigOption["values"], category = "model"): AgentConfigOption => ({
  id: "model",
  name: "Model",
  category,
  description: null,
  current: null,
  via: "option",
  values,
});
const value = (id: string, name = id, description: string | null = null) => ({ value: id, name, description });

describe("configPickerOptions", () => {
  it("groups nested paths by their first provider and preserves the full value and description", () => {
    expect(configPickerOptions(config([value("9router/cmc/Beam", "Beam display", "Fast")]))).toEqual([
      { value: "9router", label: "9router", section: true },
      { value: "9router/cmc/Beam", label: "Beam", detail: "cmc/Beam · Fast", keywords: "9router" },
    ]);
  });
  it("keeps plain ids ungrouped even when the display name contains a slash", () => {
    expect(configPickerOptions(config([value("plain", "Local / Beam", "Offline")]))).toEqual([
      { value: "plain", label: "Local / Beam", detail: "Offline", keywords: "" },
    ]);
  });
  it("collects several providers in encounter order and preserves order inside each group", () => {
    const options = configPickerOptions(
      config([value("a/One"), value("b/Two"), value("a/Three"), value("plain"), value("__section__:a")]),
    );
    expect(options.map((o) => [o.value, !!o.section])).toEqual([
      ["plain", false],
      ["__section__:a", false],
      ["a", true],
      ["a/One", false],
      ["a/Three", false],
      ["b", true],
      ["b/Two", false],
    ]);
    expect(options[3]?.detail).toBe("One");
  });
  it("leaves non-model option labels and descriptions intact", () => {
    expect(configPickerOptions(config([value("a/One", "Custom", "Description")], "mode"))).toEqual([
      { value: "a/One", label: "Custom", detail: "Description" },
    ]);
  });
});

it("shows Cursor approvals separately from its execution mode and sends the choice", () => {
  const option = (id: string, category: string, values: string[]): AgentConfigOption => ({
    id,
    category,
    name: category === "approval" ? "Approvals" : "Mode",
    description: null,
    via: "option",
    current: values[0]!,
    values: values.map((value) => ({
      value,
      name: value === "bypass" ? "Bypass approvals" : value,
      description: null,
    })),
  });
  const onChange = vi.fn();
  render(
    <ConfigPickers
      config={[
        option("mode", "mode", ["Agent", "Plan", "Ask"]),
        option("openidea.cursor.approval", "approval", ["ask", "bypass"]),
      ]}
      onChange={onChange}
    />,
  );
  expect(screen.getByText("Agent")).toBeVisible();
  fireEvent.click(screen.getByLabelText("Approvals"));
  fireEvent.click(screen.getByRole("option", { name: "Bypass approvals" }));
  expect(onChange).toHaveBeenCalledWith("openidea.cursor.approval", "bypass");
});

it("shows Allow All as a switch and sends on/off values", () => {
  const onChange = vi.fn();
  render(
    <ConfigPickers
      config={[
        {
          id: "allow_all",
          name: "Allow All",
          category: "permissions",
          description: null,
          current: "off",
          via: "option",
          values: [value("on", "On"), value("off", "Off")],
        },
      ]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("switch", { name: "Allow All" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("allow_all", "on");
});

it("shows Allow All inside the mode popup when both options exist", () => {
  const onChange = vi.fn();
  render(
    <ConfigPickers
      config={[
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          description: null,
          current: "agent",
          via: "option",
          values: [value("agent", "Agent"), value("plan", "Plan"), value("autopilot", "Autopilot")],
        },
        {
          id: "allow_all",
          name: "Allow All",
          category: "permissions",
          description: null,
          current: "off",
          via: "option",
          values: [value("on", "On"), value("off", "Off")],
        },
      ]}
      onChange={onChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Mode" }));
  fireEvent.click(screen.getByRole("option", { name: "Plan" }));
  expect(onChange).toHaveBeenNthCalledWith(1, "mode", "plan");
  fireEvent.click(screen.getByRole("button", { name: "Mode" }));
  fireEvent.click(screen.getByRole("switch", { name: "Allow All" }));
  expect(onChange).toHaveBeenNthCalledWith(2, "allow_all", "on");
});

it("shows Codex's collaboration mode next to its approval mode and sends Plan", () => {
  const onChange = vi.fn();
  render(
    <ConfigPickers
      config={[
        {
          id: "mode",
          name: "Mode",
          category: "mode",
          description: null,
          current: "workspace-write",
          via: "option",
          values: [value("read-only", "Read-only"), value("workspace-write", "Workspace access")],
        },
        {
          id: "collaboration_mode",
          name: "Collaboration mode",
          category: "collaboration_mode",
          description: null,
          current: "default",
          via: "option",
          values: [value("default", "Default"), value("plan", "Plan")],
        },
      ]}
      onChange={onChange}
    />,
  );
  expect(screen.getByRole("button", { name: "Collaboration mode" })).toHaveTextContent("Default");
  fireEvent.click(screen.getByRole("button", { name: "Collaboration mode" }));
  fireEvent.click(screen.getByRole("option", { name: "Plan" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("collaboration_mode", "plan");
});

it("sends the complete nested model id through ConfigPickers", () => {
  const onChange = vi.fn();
  render(<ConfigPickers config={[config([value("9router/cmc/Beam")])]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Model" }));
  fireEvent.click(screen.getByRole("option", { name: "Beamcmc/Beam" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("model", "9router/cmc/Beam");
});

it("edits secondary settings from the compact popup and restores focus when dismissed", () => {
  const approval: AgentConfigOption = {
    id: "approvals",
    name: "Approvals",
    category: "approval",
    description: null,
    current: "ask",
    via: "option",
    values: [value("ask", "Ask first"), value("bypass", "Bypass approvals")],
  };
  const onChange = vi.fn();
  render(<ConfigPickers config={[approval]} values={{ approvals: "bypass" }} onChange={onChange} />);
  const trigger = screen.getByRole("button", { name: "Agent settings" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Agent settings" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Approvals" }));
  fireEvent.click(screen.getByRole("option", { name: "Ask first" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("approvals", "ask");
  expect(dialog).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Agent settings" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

describe("model and effort button", () => {
  const copilotConfig = (effortLevels: string[] | null = ["low", "medium", "high", "xhigh"]): AgentConfigOption[] => [
    {
      id: "model",
      name: "Model",
      category: "model",
      description: null,
      current: "claude-sonnet-5.5",
      via: "option",
      values: [value("claude-sonnet-5.5", "Claude Sonnet 5.5", "1x"), value("gpt-6-sol", "GPT-6 Sol", "1x")],
    },
    ...(effortLevels
      ? [
          {
            id: "reasoning_effort",
            name: "Reasoning Effort",
            category: "thought_level",
            description: null,
            current: "medium",
            via: "option" as const,
            values: effortLevels.map((lvl) => value(lvl, lvl === "xhigh" ? "XHigh" : lvl)),
          },
        ]
      : []),
    {
      id: "mode",
      name: "Mode",
      category: "mode",
      description: null,
      current: "https://agentclientprotocol.com/protocol/session-modes#agent",
      via: "option",
      values: [
        value("https://agentclientprotocol.com/protocol/session-modes#agent", "Agent"),
        value("https://agentclientprotocol.com/protocol/session-modes#plan", "Plan"),
      ],
    },
    {
      id: "allow_all",
      name: "Allow All",
      category: "permissions",
      description: null,
      current: "on",
      via: "option",
      values: [value("on", "On"), value("off", "Off")],
    },
  ];

  it("shows the model with the agent's effort name and the mode with Allow All", () => {
    render(<ConfigPickers config={copilotConfig()} onChange={vi.fn()} />);
    const model = screen.getByRole("button", { name: "Model" });
    expect(model).toHaveTextContent("Claude Sonnet 5.5medium");
    expect(screen.getByRole("button", { name: "Mode" })).toHaveTextContent("AgentAllow All");
    expect(screen.queryByRole("button", { name: "Reasoning Effort" })).not.toBeInTheDocument();
  });

  it("tucks Fast into the model popup with effort", () => {
    const config = [
      ...copilotConfig().filter((o) => o.category !== "thought_level"),
      {
        id: "fast",
        name: "Fast",
        category: "model_config",
        description: null,
        current: "false",
        via: "option" as const,
        values: [value("false", "Off"), value("true", "On")],
      },
    ];
    render(<ConfigPickers config={config} onChange={vi.fn()} />);
    expect(screen.queryByRole("switch", { name: "Fast" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    const dialog = screen.getByRole("dialog", { name: "Model & effort settings" });
    expect(within(dialog).getByRole("switch", { name: "Fast" })).toHaveAttribute("aria-checked", "false");
  });

  it("opens the per-model detail view with segmented Effort Level and switches models from the list", () => {
    const onChange = vi.fn();
    render(<ConfigPickers config={copilotConfig()} values={{ reasoning_effort: "high" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    const dialog = screen.getByRole("dialog", { name: "Model & effort settings" });

    // Open Page 2 (detail view) from the active model bar.
    fireEvent.click(within(dialog).getByRole("button", { name: "Configure model" }));
    const effortGroup = within(dialog).getByRole("radiogroup", { name: "Reasoning Effort" });
    expect(within(effortGroup).getByRole("radio", { name: "high" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(effortGroup).getByRole("radio", { name: "XHigh" }));
    expect(onChange).toHaveBeenLastCalledWith("reasoning_effort", "xhigh");

    // Return to Page 1 (model list) and select another model.
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to models" }));
    fireEvent.click(within(dialog).getByRole("option", { name: /GPT-6 Sol/ }));
    expect(onChange).toHaveBeenLastCalledWith("model", "gpt-6-sol");
    expect(screen.getByRole("dialog", { name: "Model & effort settings" })).toBeInTheDocument();
  });

  it("configures Context Size (200K / 1M), Reset, Pin, and live Pricing details like VS Code Copilot", () => {
    const onChange = vi.fn();
    const geminiConfig = (effortVal = "high", contextVal = "long_context"): AgentConfigOption[] => [
      {
        id: "model",
        name: "Model",
        category: "model",
        description: null,
        current: "gemini-4-carbon",
        via: "option",
        values: [
          {
            value: "gemini-4-carbon",
            name: "Gemini 4 Carbon",
            description: "1x",
            pricing: {
              costTier: "medium",
              multiplier: 1,
              tiers: {
                default: { input: 100, output: 500, cacheRead: 10, cacheWrite: 0, contextTokens: 200_000 },
                long_context: { input: 200, output: 1000, cacheRead: 10, cacheWrite: 0, contextTokens: 1_000_000 },
              },
            },
          },
          value("gpt-6-sol", "GPT-6 Sol", "2x"),
        ],
      },
      {
        id: "reasoning_effort",
        name: "Effort Level",
        category: "thought_level",
        description: null,
        current: effortVal,
        via: "option",
        values: [value("low", "Low"), value("medium", "Medium"), value("high", "High")],
      },
      {
        id: "context_tier",
        name: "Context Size",
        category: "model_config",
        description: null,
        current: contextVal,
        via: "option",
        values: [value("default", "200K"), value("long_context", "1M")],
      },
    ];

    const { rerender } = render(<ConfigPickers config={geminiConfig("high", "long_context")} onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "Model" });
    expect(trigger).toHaveTextContent("Gemini 4 CarbonHigh · 1M");

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Model & effort settings" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Configure Gemini 4 Carbon" }));

    // Defaults (High + 1M) are active, so Reset is disabled.
    expect(within(dialog).getByRole("button", { name: "Reset to defaults" })).toBeDisabled();
    expect(within(dialog).getByText("Medium cost")).toBeVisible();
    expect(within(dialog).getByText("Credits per 1M tokens")).toBeVisible();
    expect(within(dialog).getByText("200")).toBeVisible();
    expect(within(dialog).getByText("1000")).toBeVisible();

    // Switch Context Size to 200K and Effort Level to Low.
    const ctxGroup = within(dialog).getByRole("radiogroup", { name: "Context Size" });
    fireEvent.click(within(ctxGroup).getByRole("radio", { name: "200K" }));
    expect(onChange).toHaveBeenCalledWith("context_tier", "default");

    rerender(<ConfigPickers config={geminiConfig("low", "default")} onChange={onChange} />);
    // Pricing details dynamically reflect the 200K (`default`) tier rates, and Reset is enabled.
    expect(within(dialog).getByText("100")).toBeVisible();
    expect(within(dialog).getByText("500")).toBeVisible();
    const resetBtn = within(dialog).getByRole("button", { name: "Reset to defaults" });
    expect(resetBtn).not.toBeDisabled();
    fireEvent.click(resetBtn);
    expect(onChange).toHaveBeenCalledWith("reasoning_effort", "high");
    expect(onChange).toHaveBeenCalledWith("context_tier", "long_context");

    // Pin model and verify it surfaces under a Pinned section on Page 1.
    fireEvent.click(within(dialog).getByRole("button", { name: "Pin model" }));
    expect(within(dialog).getByRole("button", { name: "Unpin model" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Back to models" }));
    expect(within(within(dialog).getByRole("listbox", { name: "Model" })).getByText("Pinned")).toBeVisible();
    // Clean up pin state for subsequent tests.
    fireEvent.click(within(dialog).getByRole("button", { name: "Configure Gemini 4 Carbon" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Unpin model" }));
  });

  it("filters the model list and picks the highlighted model with the keyboard", () => {
    const onChange = vi.fn();
    render(<ConfigPickers config={copilotConfig()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Model" }));
    const dialog = screen.getByRole("dialog", { name: "Model & effort settings" });
    const search = within(dialog).getByPlaceholderText("Search…");
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "sol" } });
    expect(within(dialog).getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("model", "gpt-6-sol");
  });

  it("keeps a plain model picker when the agent has no effort option", () => {
    render(<ConfigPickers config={copilotConfig(null)} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Model" })).toHaveAttribute("aria-haspopup", "listbox");
  });
});
