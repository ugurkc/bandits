---
order: 3
id: how-the-strategies-think
label: How the strategies think
heading: How the strategies think
---

Epsilon-greedy is the more intuitive of the two learners: it plays its current best guess most of the time, but with probability epsilon it deliberately tries something else, so it never fully commits to an early impression and never fully stops paying attention to the leader. Thompson sampling is the more elegant answer to the same problem — instead of a fixed exploration rate, it keeps a running belief about how likely each arm is to be the best one, draws a random sample from that belief every round, and plays whichever arm's sample came out highest. Early on, when the beliefs are wide and uncertain, that makes Thompson sampling explore almost by accident; as evidence piles up and the beliefs narrow, the exploration fades on its own, without anyone having to tune it down by hand.
