# Question of the day stays the same all day

**Problem:** running the routine twice on one day gave two different LeetCode problems (739 Daily Temperatures,
then 19 Remove Nth Node From End of List), because STEP 4 left the choice to the model each run.

**Fix (hashing):** the problem is chosen by hashing the IST date, so every run on the same day gets the same
one and different days look random:

```python
ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
idx = int(hashlib.sha256(ist.strftime('%Y-%m-%d').encode()).hexdigest(), 16) % 39
```

Use `hashlib`, never Python's built-in `hash()` (it changes between processes). The list has 39 classic Medium
problems in 13 topics. Checked: the same index in separate processes, and over a year every problem is used
(4 to 13 times each).

**Status:** applied on 2026-10-19 to routine `trig_01E7UKfY4deYS2R5tQR7WKkp` (the stored prompt was diffed against the
intended one: only STEP 4 changed). Runs after that use the hash. To change or restore it, edit the paragraph that starts with
"STEP 4 - Question of the day" at https://claude.ai/code/routines or resend the prompt with `RemoteTrigger update`.

## Next eight days with this rule

| IST date | Index | Problem | Topic |
| --- | --- | --- | --- |
| 2026-10-19 | 19 | 2 Add Two Numbers | linked list |
| 2026-10-20 | 36 | 56 Merge Intervals | intervals |
| 2026-10-21 | 18 | 19 Remove Nth Node From End of List | linked list |
| 2026-10-22 | 26 | 207 Course Schedule | graphs |
| 2026-10-23 | 4 | 560 Subarray Sum Equals K | hashing |
| 2026-10-24 | 7 | 11 Container With Most Water | two pointers |
| 2026-10-25 | 3 | 49 Group Anagrams | hashing |
| 2026-10-26 | 33 | 78 Subsets | backtracking |

## New STEP 4 (paste this)

```
STEP 4 - Question of the day. The problem is FIXED by the date through a hash, so every run on the same IST day shows the SAME problem while different days look random. Compute it in your one python script with hashlib (never Python's built-in hash(), which changes between runs): ist = datetime.now(timezone(timedelta(hours=5, minutes=30))); date_str = ist.strftime('%Y-%m-%d'); idx = int(hashlib.sha256(date_str.encode()).hexdigest(), 16) % 39; problem = PROBLEMS[idx], counting from 0. Never choose, swap, skip or re-roll it, never use search results or earlier PDFs to decide, and never change it because a run is a repeat. PROBLEMS (index: number title (slug) [topic]): 0: 238 Product of Array Except Self (product-of-array-except-self) [arrays]; 1: 53 Maximum Subarray (maximum-subarray) [arrays]; 2: 189 Rotate Array (rotate-array) [arrays]; 3: 49 Group Anagrams (group-anagrams) [hashing]; 4: 560 Subarray Sum Equals K (subarray-sum-equals-k) [hashing]; 5: 347 Top K Frequent Elements (top-k-frequent-elements) [hashing]; 6: 15 3Sum (3sum) [two pointers]; 7: 11 Container With Most Water (container-with-most-water) [two pointers]; 8: 167 Two Sum II - Input Array Is Sorted (two-sum-ii-input-array-is-sorted) [two pointers]; 9: 3 Longest Substring Without Repeating Characters (longest-substring-without-repeating-characters) [sliding window]; 10: 424 Longest Repeating Character Replacement (longest-repeating-character-replacement) [sliding window]; 11: 567 Permutation in String (permutation-in-string) [sliding window]; 12: 739 Daily Temperatures (daily-temperatures) [stack]; 13: 150 Evaluate Reverse Polish Notation (evaluate-reverse-polish-notation) [stack]; 14: 853 Car Fleet (car-fleet) [stack]; 15: 33 Search in Rotated Sorted Array (search-in-rotated-sorted-array) [binary search]; 16: 153 Find Minimum in Rotated Sorted Array (find-minimum-in-rotated-sorted-array) [binary search]; 17: 875 Koko Eating Bananas (koko-eating-bananas) [binary search]; 18: 19 Remove Nth Node From End of List (remove-nth-node-from-end-of-list) [linked list]; 19: 2 Add Two Numbers (add-two-numbers) [linked list]; 20: 143 Reorder List (reorder-list) [linked list]; 21: 102 Binary Tree Level Order Traversal (binary-tree-level-order-traversal) [trees]; 22: 98 Validate Binary Search Tree (validate-binary-search-tree) [trees]; 23: 236 Lowest Common Ancestor of a Binary Tree (lowest-common-ancestor-of-a-binary-tree) [trees]; 24: 200 Number of Islands (number-of-islands) [graphs]; 25: 133 Clone Graph (clone-graph) [graphs]; 26: 207 Course Schedule (course-schedule) [graphs]; 27: 215 Kth Largest Element in an Array (kth-largest-element-in-an-array) [heap]; 28: 621 Task Scheduler (task-scheduler) [heap]; 29: 973 K Closest Points to Origin (k-closest-points-to-origin) [heap]; 30: 322 Coin Change (coin-change) [DP]; 31: 300 Longest Increasing Subsequence (longest-increasing-subsequence) [DP]; 32: 198 House Robber (house-robber) [DP]; 33: 78 Subsets (subsets) [backtracking]; 34: 39 Combination Sum (combination-sum) [backtracking]; 35: 46 Permutations (permutations) [backtracking]; 36: 56 Merge Intervals (merge-intervals) [intervals]; 37: 57 Insert Interval (insert-interval) [intervals]; 38: 435 Non-overlapping Intervals (non-overlapping-intervals) [intervals]. Do NOT copy the official statement. Give: number and exact title, difficulty Medium, topic tags, companies (write 'commonly asked at large tech companies (not verified)' unless you are sure), link https://leetcode.com/problems/<slug>/, a 2-line simple reframing, two tiny examples with input and output (use the first two examples everyone knows from the problem, so repeat runs match), constraints (say if unconfirmed), 'Why today: picked by date hash <idx> of 39; topic <topic>', one study-guide link. No solution or hints.
```

The explanation text is still written by the model on each run, so wording can differ a little; the problem,
its number and title, the examples it must use ("the first two everyone knows") and "Why today" are fixed.
