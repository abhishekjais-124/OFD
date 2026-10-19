# Question of the day stays the same all day

**Problem:** running the routine twice on one day gave two different LeetCode problems (739 Daily Temperatures,
then 19 Remove Nth Node From End of List), because STEP 4 left the choice to the model each run.

**Fix:** pick the problem from the IST date with a fixed table, so every run on the same day shows the same one.
The rotation is 13 topics by day of the year, three problems per topic (39 in total), all Medium.

**Status:** NOT applied yet. The update to routine `trig_01E7UKfY4deYS2R5tQR7WKkp` was refused by the auto-mode
classifier (the whole 30 KB prompt has to be resent, and it was judged dangerous without an explanation).
Paste the block below over STEP 4 at https://claude.ai/code/routines (open the routine, edit the prompt,
replace the paragraph that starts with "STEP 4 - Question of the day", leave everything else as it is).

## Next seven days with this rule

| IST date | Day of year | Topic | Problem |
| --- | --- | --- | --- |
| 2026-10-19 | 292 | binary search | 153 Find Minimum in Rotated Sorted Array |
| 2026-10-20 | 293 | linked list | 2 Add Two Numbers |
| 2026-10-21 | 294 | trees | 98 Validate Binary Search Tree |
| 2026-10-22 | 295 | graphs | 133 Clone Graph |
| 2026-10-23 | 296 | heap | 621 Task Scheduler |
| 2026-10-24 | 297 | DP | 300 Longest Increasing Subsequence |
| 2026-10-25 | 298 | backtracking | 39 Combination Sum |

## New STEP 4 (paste this)

```
STEP 4 - Question of the day. The problem is FIXED by the date, so every run on the same IST day shows the SAME problem. Compute it in your one python script: day = datetime.now(timezone(timedelta(hours=5, minutes=30))).timetuple().tm_yday (1 to 366, the IST date); topic = TOPICS[(day-1) % 13] with TOPICS in this order: arrays, hashing, two pointers, sliding window, stack, binary search, linked list, trees, graphs, heap, DP, backtracking, intervals; problem = entry ((day-1) // 13) % 3 of that topic in the table below. Never choose, swap, skip or re-roll it, never use search results or earlier PDFs to decide, and never change it because a run is a repeat. TABLE (topic: 1st / 2nd / 3rd, each as number title (slug)): arrays: 238 Product of Array Except Self (product-of-array-except-self) / 53 Maximum Subarray (maximum-subarray) / 189 Rotate Array (rotate-array); hashing: 49 Group Anagrams (group-anagrams) / 560 Subarray Sum Equals K (subarray-sum-equals-k) / 347 Top K Frequent Elements (top-k-frequent-elements); two pointers: 15 3Sum (3sum) / 11 Container With Most Water (container-with-most-water) / 167 Two Sum II - Input Array Is Sorted (two-sum-ii-input-array-is-sorted); sliding window: 3 Longest Substring Without Repeating Characters (longest-substring-without-repeating-characters) / 424 Longest Repeating Character Replacement (longest-repeating-character-replacement) / 567 Permutation in String (permutation-in-string); stack: 739 Daily Temperatures (daily-temperatures) / 150 Evaluate Reverse Polish Notation (evaluate-reverse-polish-notation) / 853 Car Fleet (car-fleet); binary search: 33 Search in Rotated Sorted Array (search-in-rotated-sorted-array) / 153 Find Minimum in Rotated Sorted Array (find-minimum-in-rotated-sorted-array) / 875 Koko Eating Bananas (koko-eating-bananas); linked list: 19 Remove Nth Node From End of List (remove-nth-node-from-end-of-list) / 2 Add Two Numbers (add-two-numbers) / 143 Reorder List (reorder-list); trees: 102 Binary Tree Level Order Traversal (binary-tree-level-order-traversal) / 98 Validate Binary Search Tree (validate-binary-search-tree) / 236 Lowest Common Ancestor of a Binary Tree (lowest-common-ancestor-of-a-binary-tree); graphs: 200 Number of Islands (number-of-islands) / 133 Clone Graph (clone-graph) / 207 Course Schedule (course-schedule); heap: 215 Kth Largest Element in an Array (kth-largest-element-in-an-array) / 621 Task Scheduler (task-scheduler) / 973 K Closest Points to Origin (k-closest-points-to-origin); DP: 322 Coin Change (coin-change) / 300 Longest Increasing Subsequence (longest-increasing-subsequence) / 198 House Robber (house-robber); backtracking: 78 Subsets (subsets) / 39 Combination Sum (combination-sum) / 46 Permutations (permutations); intervals: 56 Merge Intervals (merge-intervals) / 57 Insert Interval (insert-interval) / 435 Non-overlapping Intervals (non-overlapping-intervals). Do NOT copy the official statement. Give: number and exact title, difficulty Medium, topic tags, companies (write 'commonly asked at large tech companies (not verified)' unless you are sure), link https://leetcode.com/problems/<slug>/, a 2-line simple reframing, two tiny examples with input and output (use the first two examples everyone knows from the problem, so repeat runs match), constraints (say if unconfirmed), 'Why today: Day <day> of the year; the topic rotation lands on <topic>', one study-guide link. No solution or hints.
```

The explanation text is still written by the model on each run, so wording can differ a little; the problem,
its number and title, the examples it must use ("the first two everyone knows") and "Why today" are fixed.
