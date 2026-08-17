---
order: 1
id: the-problem
label: The problem itself
heading: The problem itself
---

Picture a row of slot machines, each with a different, unknown payout rate — pull the wrong lever and you never find out what the right one would have paid. That is the k-armed bandit problem, and it is a better model for live-ops than it sounds: every live-ops lever you can cheaply swap is an arm, its true conversion rate is hidden, and every round you spend testing a mediocre option is a round you were not spending on the best one. The tension is called the explore-exploit trade-off — explore too little and you commit early to the wrong arm forever, explore too much and you waste rounds confirming what you already knew. The five noisy trial days you just played, and the thirteen-week budget you split afterward, were both this same tension in miniature — before any strategy stepped in to handle it systematically.
