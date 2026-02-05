# Model Selection Flowchart

This document details all decision trees for determining which model gets used when an agent is invoked.

## High-Level Overview

```mermaid
flowchart TD
    subgraph Entry["Entry Points"]
        WS[WebSocket Chat]
        CH[Channel Message<br/>Telegram/etc]
        CR[Cron Scheduler]
        WH[Webhook]
    end

    WS --> INIT
    CH --> INIT
    CR --> INIT
    WH --> INIT

    INIT[Load Config & Create AgentRunner]
    INIT --> SELECT

    subgraph SELECT["Model Selection"]
        MS[ModelSelector.select]
        MS --> |workspace models?| WM{Workspace<br/>models<br/>defined?}
        WM --> |Yes| USE_WS[Use workspace candidates]
        WM --> |No| USE_GL[Use global candidates]
        USE_WS --> ITER
        USE_GL --> ITER
        ITER[Iterate candidates in order]
    end

    subgraph COOLDOWN["Cooldown Check"]
        ITER --> CD{Is candidate<br/>on cooldown?}
        CD --> |Yes| NEXT{More<br/>candidates?}
        NEXT --> |Yes| ITER
        NEXT --> |No| FAIL[Return null<br/>No models available]
        CD --> |No| FOUND[Return ModelSelection]
    end

    FOUND --> STREAM
    FAIL --> DONE_FAIL[Done: No available models]

    subgraph STREAM["Streaming Execution"]
        ST[streamText with selected model]
        ST --> LOOP[Process stream events]
        LOOP --> |text-delta| ACC[Accumulate response]
        LOOP --> |tool-call| TC[Execute tool]
        LOOP --> |tool-result| TR[Yield result]
        TC --> ESC_CHK{Tool requires<br/>slow model?}
        ESC_CHK --> |Yes| ESC[Mark escalated]
        ESC_CHK --> |No| CONT
        ESC --> CONT[Continue streaming]
        ACC --> CONT
        TR --> CONT
        CONT --> |more events| LOOP
        CONT --> |stream done| RECORD
    end

    RECORD[Record transcript & usage]
    RECORD --> DONE[Done: Return response]

    style FAIL fill:#ffcccc
    style DONE_FAIL fill:#ffcccc
    style FOUND fill:#ccffcc
    style DONE fill:#ccffcc
```

## Detailed Decision Trees

### 1. Entry Point Resolution

```mermaid
flowchart TD
    START[Agent Invocation Request]
    START --> SOURCE{Source?}

    SOURCE --> |WebSocket| WS_FLOW
    SOURCE --> |Channel| CH_FLOW
    SOURCE --> |Cron| CR_FLOW
    SOURCE --> |Webhook| WH_FLOW

    subgraph WS_FLOW["WebSocket Flow"]
        WS1[gateway.registerMethod 'chat.send']
        WS1 --> WS2[Validate workspace access]
        WS2 --> WS3[Get/create session]
    end

    subgraph CH_FLOW["Channel Flow"]
        CH1[messageQueue.onFlush]
        CH1 --> CH2[Resolve channel → workspace]
        CH2 --> CH3[Get/create session by channel context]
    end

    subgraph CR_FLOW["Cron Flow"]
        CR1[cronScheduler.onJob]
        CR1 --> CR2[Load workspace from job config]
        CR2 --> CR3[Create new session for job]
    end

    subgraph WH_FLOW["Webhook Flow"]
        WH1[webhookManager.onWebhook]
        WH1 --> WH2[Map webhook → workspace]
        WH2 --> WH3[Get/create session]
    end

    WS3 --> BUILD
    CH3 --> BUILD
    CR3 --> BUILD
    WH3 --> BUILD

    BUILD[Build AgentRunOptions]
    BUILD --> RUN[agentRunner.run]
```

### 2. Model Candidate Resolution

```mermaid
flowchart TD
    START[Resolve Model Candidates]

    START --> GROUP{Model Group?}
    GROUP --> |fast| FAST[Get 'fast' candidates]
    GROUP --> |slow| SLOW[Get 'slow' candidates]

    FAST --> WS_CHK
    SLOW --> WS_CHK

    WS_CHK{workspaceModels<br/>provided?}
    WS_CHK --> |Yes| WS_HAS{workspace has<br/>candidates for<br/>this group?}
    WS_CHK --> |No| USE_GLOBAL

    WS_HAS --> |Yes| USE_WORKSPACE[Use workspace candidates<br/>COMPLETELY OVERRIDE global]
    WS_HAS --> |No| USE_GLOBAL[Use global candidates]

    USE_WORKSPACE --> RESULT
    USE_GLOBAL --> RESULT

    RESULT[candidates: ModelCandidate array]

    subgraph NOTE["⚠️ Current Implementation Gap"]
        N1[workspaceModels is NEVER<br/>passed to AgentRunOptions]
        N2[Always uses globalModels]
    end

    style NOTE fill:#fff3cd
```

### 3. Cooldown Tracking

```mermaid
flowchart TD
    START[Check if model available]
    START --> KEY[Build key: 'provider:model']
    KEY --> LOOKUP{Key in<br/>cooldowns map?}

    LOOKUP --> |No| AVAILABLE[Return: AVAILABLE]
    LOOKUP --> |Yes| EXPIRED{Current time ≥<br/>expiry time?}

    EXPIRED --> |Yes| CLEANUP[Delete from map]
    CLEANUP --> AVAILABLE
    EXPIRED --> |No| UNAVAILABLE[Return: UNAVAILABLE]

    subgraph DURATIONS["Cooldown Durations by Error Type"]
        D1["rate_limit (429): 60 seconds"]
        D2["timeout: 30 seconds"]
        D3["unknown: 15 seconds"]
        D4["billing/auth: 5 minutes"]
        D5["format: 0 seconds (no cooldown)"]
    end

    style AVAILABLE fill:#ccffcc
    style UNAVAILABLE fill:#ffcccc
```

### 4. Model Selection Algorithm

```mermaid
flowchart TD
    START[ModelSelector.select]
    START --> ARGS["Args: group, globalCandidates, workspaceCandidates?"]

    ARGS --> RESOLVE[Resolve candidate list]
    RESOLVE --> |"workspaceCandidates ?? globalCandidates"| CANDIDATES[candidates array]

    CANDIDATES --> INIT[i = 0]
    INIT --> LOOP{i < candidates.length?}

    LOOP --> |No| FAIL[Return NULL]
    LOOP --> |Yes| CHECK[candidate = candidates at i]

    CHECK --> AVAIL{CooldownTracker<br/>.isAvailable?}
    AVAIL --> |No| INCR[i++]
    INCR --> LOOP

    AVAIL --> |Yes| BUILD[Build ModelSelection]

    BUILD --> MODEL[model = getLanguageModel<br/>provider, model]
    MODEL --> GATEWAY[gatewayOptions = <br/>getGatewayProviderOptions<br/>provider]
    GATEWAY --> RETURN["Return {<br/>  model,<br/>  candidate,<br/>  group,<br/>  gatewayOptions<br/>}"]

    style FAIL fill:#ffcccc
    style RETURN fill:#ccffcc
```

### 5. Escalation State Machine

```mermaid
stateDiagram-v2
    [*] --> Fast: createEscalationState()

    Fast: Fast Model Group
    Fast: toolCallDepth = 0
    Fast: totalTokens = 0
    Fast: escalated = false

    Slow: Slow Model Group
    Slow: escalated = true
    Slow: reason = "..."

    Fast --> Fast: recordToolCall()\ntoolCallDepth++
    Fast --> Fast: recordTokenUsage()\ntotalTokens += n

    Fast --> Slow: Tool requires slow model
    Fast --> Slow: toolCallDepth > 3
    Fast --> Slow: totalTokens > 4000

    Slow --> Slow: All operations\n(cannot de-escalate)

    note right of Slow
        ✅ Model switch is triggered
        Stream restarts with slow model
        Emits 'model-switch' event
    end note
```

### 6. Escalation Decision Tree

```mermaid
flowchart TD
    START[shouldEscalate check]

    START --> ALREADY{state.escalated<br/>== true?}
    ALREADY --> |Yes| YES[Return: SHOULD ESCALATE]

    ALREADY --> |No| TOOLS{toolCallDepth ><br/>maxToolCallDepth?}
    TOOLS --> |Yes| YES
    TOOLS --> |No| TOKENS{totalTokens ><br/>tokenThreshold?}

    TOKENS --> |Yes| YES
    TOKENS --> |No| NO[Return: NO ESCALATION]

    subgraph DEFAULTS["Default Thresholds"]
        T1["maxToolCallDepth: 3"]
        T2["tokenThreshold: 4000"]
    end

    subgraph TRIGGERS["Explicit Escalation Triggers"]
        E1["Tool with requestedGroup: 'slow'"]
        E2["Manual escalate() call"]
    end

    style YES fill:#ffcccc
    style NO fill:#ccffcc
```

### 7. Gateway BYOK Resolution

```mermaid
flowchart TD
    START[buildGatewayOptions]
    START --> PROVIDER[Get provider name]

    PROVIDER --> LOOKUP{Provider in<br/>providerEnvKeys?}

    LOOKUP --> |No| NONE[Return: undefined]
    LOOKUP --> |Yes| ENVKEY[Get env key name]

    ENVKEY --> HASKEY{process.env<br/>has key?}
    HASKEY --> |No| NONE
    HASKEY --> |Yes| BUILD["Return {<br/>  byok: {<br/>    [provider]: [{apiKey}]<br/>  }<br/>}"]

    subgraph MAPPING["Provider → Env Key Mapping"]
        M1["anthropic → ANTHROPIC_API_KEY"]
        M2["google → GEMINI_API_KEY"]
        M3["openai → OPENAI_API_KEY"]
        M4["xai → XAI_API_KEY"]
    end

    style NONE fill:#fff3cd
    style BUILD fill:#ccffcc
```

### 8. Error Classification (Failover)

```mermaid
flowchart TD
    START[classifyError]
    START --> ERR[Examine error]

    ERR --> STATUS{HTTP Status?}

    STATUS --> |429| RATE[rate_limit]
    STATUS --> |401/403| AUTH[auth]
    STATUS --> |other| MSG{Error message<br/>contains?}

    MSG --> |"rate limit"<br/>"too many requests"| RATE
    MSG --> |"unauthorized"<br/>"forbidden"<br/>"api key"| AUTH
    MSG --> |"billing"<br/>"quota"<br/>"insufficient"| BILLING[billing]
    MSG --> |"timeout"<br/>"etimedout"<br/>"econnreset"| TIMEOUT[timeout]
    MSG --> |"invalid"<br/>"malformed"<br/>"bad request"| FORMAT[format]
    MSG --> |none match| UNKNOWN[unknown]

    RATE --> RETRY{Retryable?}
    TIMEOUT --> RETRY
    UNKNOWN --> RETRY

    AUTH --> NORETRY[NOT Retryable<br/>Throw immediately]
    BILLING --> NORETRY
    FORMAT --> NORETRY

    RETRY --> |Yes| COOLDOWN[Add to cooldown<br/>Try next candidate]

    subgraph LEGEND["⚠️ Implementation Gap"]
        L1[Failover logic EXISTS but<br/>is NOT USED in AgentRunner]
        L2[Uses streamText directly<br/>not streamWithFailover]
    end

    style NORETRY fill:#ffcccc
    style COOLDOWN fill:#fff3cd
```

### 9. Complete End-to-End Flow

```mermaid
flowchart TD
    subgraph ENTRY["1. Entry"]
        E1[Request arrives]
        E1 --> E2[Resolve workspace]
        E2 --> E3[Get/create session]
        E3 --> E4[Create AgentRunner]
    end

    subgraph OPTIONS["2. Build Options"]
        O1[globalModels from config]
        O2[workspaceModels: undefined ⚠️]
        O3[messages from session]
        O4[agent profile]
        O5[tool context]
    end

    E4 --> OPTIONS
    OPTIONS --> RUN

    subgraph RUN["3. AgentRunner.run()"]
        R1[Create ModelSelector]
        R1 --> R2["Select 'fast' model"]
        R2 --> R3{Selection<br/>successful?}
        R3 --> |No| FAIL[Done: No models]
        R3 --> |Yes| R4[Initialize escalation state]
        R4 --> R5[Build system prompt]
        R5 --> R6[Get AI SDK tools]
    end

    R6 --> STREAM

    subgraph STREAM["4. Stream Execution (Loop)"]
        S1[streamText with model]
        S1 --> S2[Process stream]
        S2 --> S3{Event type?}

        S3 --> |text-delta| S4[Yield text]
        S3 --> |tool-call| S5[Execute tool]
        S3 --> |tool-result| S6[Yield result]

        S5 --> S7{Tool wants<br/>slow model?}
        S7 --> |Yes| S8[Mark escalated]
        S7 --> |No| S9[Continue]
        S8 --> S9

        S4 --> S10{More events?}
        S6 --> S10
        S9 --> S10

        S10 --> |Yes| S2
        S10 --> |No| S11{Escalated &<br/>had tool calls?}

        S11 --> |Yes| S12[Switch to slow model]
        S12 --> S13[Emit 'model-switch' event]
        S13 --> S1
        S11 --> |No| RECORD
    end

    subgraph RECORD["5. Record Results"]
        REC1[Append to transcript]
        REC1 --> REC2[Record usage/cost]
        REC2 --> REC3[Yield 'done' event]
    end

    FAIL --> END[End]
    REC3 --> END

    style FAIL fill:#ffcccc
    style END fill:#ccffcc
```

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| Workspace model overrides | ❌ Not wired | Always uses global models |
| Escalation model switch | ✅ Implemented | Switches to slow model when thresholds exceeded |
| Failover cascade | ❌ Not called | No automatic retry on model failure |
| Tool-requested slow model | ✅ Implemented | Triggers escalation and model switch |

## Key Files

| File | Purpose |
|------|---------|
| `apps/bot/src/index.ts` | Entry points (WebSocket, Channel, Cron, Webhook) |
| `packages/core/src/agent/runner.ts` | Main agent execution loop |
| `packages/core/src/ai/model-group.ts` | ModelSelector, CooldownTracker |
| `packages/core/src/ai/escalation.ts` | Escalation state machine |
| `packages/core/src/ai/failover.ts` | Error classification, retry logic (unused) |
| `packages/core/src/ai/provider.ts` | Provider factory (openai, anthropic, gateway) |
| `packages/schemas/src/config.ts` | Config schema definitions |
