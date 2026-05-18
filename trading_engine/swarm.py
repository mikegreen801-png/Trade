import asyncio
import random

class TechnicalAgent:
    def __init__(self, symbol: str):
        self.symbol = symbol
        
    async def analyze(self):
        # Simulate network delay for API calls
        await asyncio.sleep(random.uniform(0.5, 1.5))
        # Dummy analysis
        score = random.uniform(-1, 1)
        return {"agent": "Technical", "score": score, "note": "Moving averages aligned" if score > 0 else "Bearish divergence"}

class MacroAgent:
    def __init__(self, symbol: str):
        self.symbol = symbol
        
    async def analyze(self):
        await asyncio.sleep(random.uniform(0.5, 1.5))
        score = random.uniform(-1, 1)
        return {"agent": "Macro", "score": score, "note": "VIX falling, yields stable" if score > 0 else "High inflation print risk"}

class SentimentAgent:
    def __init__(self, symbol: str):
        self.symbol = symbol
        
    async def analyze(self):
        await asyncio.sleep(random.uniform(0.5, 1.5))
        score = random.uniform(-1, 1)
        return {"agent": "Sentiment", "score": score, "note": "High social volume" if score > 0 else "Negative news sentiment"}

class SwarmOrchestrator:
    """
    Spins up multiple independent agents to analyze a symbol concurrently.
    Aggregates their scores into a final DecisionMatrix.
    """
    def __init__(self, symbol: str):
        self.symbol = symbol
        self.agents = [
            TechnicalAgent(symbol),
            MacroAgent(symbol),
            SentimentAgent(symbol)
        ]
        
    async def run_swarm(self):
        # Run all agents concurrently
        results = await asyncio.gather(*(agent.analyze() for agent in self.agents))
        
        total_score = sum(r["score"] for r in results)
        avg_score = total_score / len(self.agents)
        
        decision = "HOLD"
        if avg_score > 0.3:
            decision = "BUY"
        elif avg_score < -0.3:
            decision = "SELL"
            
        return {
            "symbol": self.symbol,
            "decision": decision,
            "confidence_score": round(avg_score, 2),
            "agent_breakdown": results
        }
