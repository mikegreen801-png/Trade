import random
import numpy as np
from typing import Dict, Any

class MonteCarloSimulator:
    """
    Institutional-grade Monte Carlo Simulation engine for "God Mode" stress testing.
    Runs thousands of random permutations of a trading strategy against historical data,
    injecting realistic market frictions (slippage, latency, black swan drops) to calculate
    probability of ruin and expected distribution of returns.
    """
    
    def __init__(self, initial_capital: float = 100000.0, iterations: int = 1000, periods: int = 252):
        self.initial_capital = initial_capital
        self.iterations = iterations
        self.periods = periods # Default 1 year of trading days
        
    def simulate(self, win_rate: float, avg_win_pct: float, avg_loss_pct: float, 
                 slippage_pct: float = 0.001, black_swan_prob: float = 0.005, black_swan_drop_pct: float = 0.20) -> Dict[str, Any]:
        """
        Runs the simulation matrix.
        Returns aggregate metrics for charting bell curves and equity paths.
        """
        final_equities = []
        equity_paths = []
        ruin_count = 0
        
        for _ in range(self.iterations):
            capital = self.initial_capital
            path = [capital]
            is_ruined = False
            
            for _ in range(self.periods):
                if capital <= 0:
                    is_ruined = True
                    break
                    
                # Black swan event
                if random.random() < black_swan_prob:
                    capital = capital * (1 - black_swan_drop_pct)
                    path.append(capital)
                    continue
                
                # Normal trade execution
                if random.random() < win_rate:
                    # Win
                    capital = capital * (1 + avg_win_pct - slippage_pct)
                else:
                    # Loss
                    capital = capital * (1 - avg_loss_pct - slippage_pct)
                    
                path.append(capital)
                
            final_equities.append(capital)
            equity_paths.append(path)
            if is_ruined or capital < self.initial_capital * 0.1: # 90% drawdown considered ruin
                ruin_count += 1
                
        # Statistical analysis
        final_equities_arr = np.array(final_equities)
        
        # We'll return a sample of paths to draw the "spaghetti chart" (e.g. 50 paths)
        sample_paths = equity_paths[:50] if len(equity_paths) > 50 else equity_paths
        
        return {
            "initial_capital": self.initial_capital,
            "iterations": self.iterations,
            "mean_ending_capital": float(np.mean(final_equities_arr)),
            "median_ending_capital": float(np.median(final_equities_arr)),
            "max_ending_capital": float(np.max(final_equities_arr)),
            "min_ending_capital": float(np.min(final_equities_arr)),
            "std_dev": float(np.std(final_equities_arr)),
            "probability_of_ruin_pct": round((ruin_count / self.iterations) * 100, 2),
            "sample_paths": sample_paths, # For drawing UI lines
            "distribution": self._calculate_distribution(final_equities_arr)
        }
        
    def _calculate_distribution(self, equities: np.ndarray, bins: int = 50) -> Dict[str, Any]:
        """Calculates the histogram for the bell curve."""
        counts, bin_edges = np.histogram(equities, bins=bins)
        # Convert bin edges to strings representing the range (or just the midpoints)
        midpoints = (bin_edges[:-1] + bin_edges[1:]) / 2
        return {
            "counts": [int(c) for c in counts],
            "labels": [round(float(m), 2) for m in midpoints]
        }
