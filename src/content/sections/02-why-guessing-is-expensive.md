---
order: 2
id: why-guessing-is-expensive
label: Why guessing is expensive
heading: Why guessing is expensive
---

The simplest strategy on this page is fixed A/B split — keep testing every campaign equally, forever, the same way a standard A/B test never stops sending traffic to the losing variant just because it is losing. That fairness is exactly what makes it expensive: once you have enough evidence to know an arm is worse, every additional pull on it is pure waste, and a fixed split keeps paying that price for the whole race instead of just the first stretch of it. The regret chart is what makes this concrete — it tracks installs left on the table compared to an oracle that always knew the best arm, and fixed split's line climbs in an almost straight line because its mistake rate never improves, while the two learning strategies bend and flatten as they figure out where the real payoff is.
