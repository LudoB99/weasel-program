# Weasel Program

An interactive browser-based simulation of Richard Dawkins' Weasel Program, originally described in *The Blind Watchmaker* (1986).

## What it demonstrates

Dawkins designed the Weasel Program to illustrate the difference between **single-step selection** and **cumulative selection** in evolution.

The naive assumption about evolution is that a complex outcome (say, the 28-character string `METHINKS IT IS LIKE A WEASEL`) would have to appear all at once by pure chance. The odds of that happening randomly are astronomically small (roughly 1 in 10³⁶), making it seem like evolution couldn't possibly produce complex structures.

The program shows why that intuition is wrong. Instead of requiring the target to appear in one lucky step, it works like natural selection:

1. Start with a random string of the same length as the target
2. Each generation, produce a population of copies, each with small random mutations
3. Keep the copy that most closely matches the target
4. Repeat

Because each generation builds on the best result of the previous one (**cumulative selection**), the string converges on the target in tens to hundreds of generations, not trillions. The key insight is that evolution doesn't start from scratch each time; it preserves and accumulates small improvements.

## Features

- Configurable target string, population size, and mutation rate
- Character-by-character animation showing which positions lock in over time
- Population view showing the children of each generation before selection
- Scrollable history log of past generations
- Live fitness chart tracking progress over time
- Variable speed from slow (animated) to maximum (batched frames)

## Usage

Open `index.html` directly in any browser. No build step or server required.

## Parameters

| Parameter | Default | Description |
|---|---|---|
| Target string | `METHINKS IT IS LIKE A WEASEL` | The phrase the simulation evolves toward |
| Population size | 100 | Number of mutated copies produced each generation |
| Mutation rate | 5% | Probability of each character mutating per generation |

Increasing the population size or lowering the mutation rate generally speeds up convergence; too high a mutation rate causes the string to drift and slow down.

## Live demo

[weasel.lbelzile.ca](https://weasel.lbelzile.ca)
