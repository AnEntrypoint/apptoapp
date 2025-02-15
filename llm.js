(async () => {
  try {
    // First API call
    const res1 = await fetch("https://api.individual.githubcopilot.com/github/chat/threads/69d35d3d-3bd8-4202-bc25-5f7f09d3bc68/messages", {
      method: "POST",
      headers: {
        "accept": "*/*",
        "authorization": "GitHub-Bearer t5o_nNskhX7KlhmqHp9-jQEc_Eg-J2RkiDnEf_nhQiNA60rL3-pX178AS3RG6Vmbix8dcAEvNw33JQnLZd5Mt79_hGIIcLBT51Cu_nbBoMg=",
        "content-type": "text/event-stream",
        "copilot-integration-id": "copilot-chat"
      },
      body: JSON.stringify({
        responseMessageID: "2bac492d-8f56-47ae-9230-2e0a4d8ccfb5",
        content: "hi there",
        intent: "conversation",
        references: [],
        context: [],
        currentURL: "https://github.com/copilot/c/69d35d3d-3bd8-4202-bc25-5f7f09d3bc68",
        streaming: true,
        confirmations: [],
        customInstructions: [],
        model: "claude-3.5-sonnet",
        mode: "immersive",
        customCopilotID: null,
        parentMessageID: "",
        tools: [],
        mediaContent: []
      })
    });
    
    console.log("First call status:", res1.status);
    const text1 = await res1.text();
    console.log("First call response:", text1);

    // Second API call
    const res2 = await fetch("https://collector.github.com/github/collect", {
      method: "POST",
      headers: {
        "content-type": "text/plain;charset=UTF-8"
      },
      body: JSON.stringify({
        client_id: "53290473.1723015524",
        events: [{
          page: "https://github.com/copilot/c/69d35d3d-3bd8-4202-bc25-5f7f09d3bc68",
          title: "GitHub Copilot features and functionality · GitHub Copilot",
          context: {
            actor_id: "657315",
            actor_login: "lanmower",
            actor_hash: "9e6311207af6934f5645117c03327e4472ba1db072d224700f00ba9a9190182c",
            referrer: null,
            request_id: "C705:3F764C:3A3607:6575D2:67B0F11F",
            visitor_id: "228880840446386532",
            region_edge: "southafricanorth",
            region_render: "iad",
            staff: "false",
            id: "77304af8-3915-4536-80ec-3fc4b0c67b06",
            role: "assistant",
            createdAt: "2025-02-15T19:55:57.795932863Z",
            threadID: "69d35d3d-3bd8-4202-bc25-5f7f09d3bc68",
            referenceCount: "0",
            intent: "conversation",
            copilotAnnotations: "{\"CodeVulnerability\":[],\"PublicCodeReference\":[]}",
            skillExecutions: "[]",
            totalTime: "2527",
            ttfb: "2104",
            ttft: "2104",
            model: "gpt-4o",
            mode: "immersive",
            count: "10"
          },
          type: "copilot.message_streaming_completed"
        }],
        request_context: {
          referrer: "",
          user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          screen_resolution: "1536x864",
          browser_resolution: "1396x391",
          browser_languages: "en-US,en",
          pixel_ratio: 1.375,
          timestamp: 1739649356396,
          tz_seconds: 7200
        }
      })
    });
    
    console.log("Second call status:", res2.status);
    const text2 = await res2.text();
    console.log("Second call response:", text2);
  } catch (error) {
    console.error("Error:", error);
  }
})(); 