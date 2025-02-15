(async () => {
  try {
    // First API call
    const res1 = await fetch("https://api.individual.githubcopilot.com/github/chat/threads/69d35d3d-3bd8-4202-bc25-5f7f09d3bc68/messages", {
      method: "POST",
      headers: {
        "accept": "*/*",
        "authorization": "GitHub-Bearer P-wEMDUoVrqzlGpd_MVDx5FWxrXWCINDhjuNKDoXb5SvRSqdsOsYOg2xREtSGmzDPoSNUEhZq2Pezmf4IDqNhnf0O3wQubODKtmqw0cjg70=",
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
        streaming: false,
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
    return text1;
  } catch (error) {
    console.error("Error:", error);
  }
})(); 