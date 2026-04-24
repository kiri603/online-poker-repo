package com.game.poker.service;

import com.game.poker.model.Card;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

@Component
public class RuleEngine {

    // 定义所有支持的牌型枚举
    public enum CardType {
        SINGLE,             // 单牌
        PAIR,               // 对子
        TRIPLE,             // 三不带
        TRIPLE_WITH_SINGLE, // 三带一
        TRIPLE_WITH_PAIR,   // 三带一对
        STRAIGHT,           // 顺子
        STRAIGHT_PAIR,      // 连对
        BOMB,               // 炸弹
        INVALID,             // 非法牌型
        ROCKET,
        AIRPLANE,//王炸
    }

    // 用于封装解析后的牌型结果
    public static class CardPattern {
        public CardType type;
        public int primaryWeight; // 主牌权重（比如三带一中的“三”的权重，用于比大小）
        public int length;        // 出牌总张数（用于校验顺子等必须长度一致的情况）

        public CardPattern(CardType type, int primaryWeight, int length) {
            this.type = type;
            this.primaryWeight = primaryWeight;
            this.length = length;
        }
    }

    /**
     * 校验本次出牌是否合法，并判断是否大过桌上的上一手牌
     *
     * @param playCards 本次准备打出的牌
     * @param lastCards 桌面上最新的一手牌（如果当前是自由出牌回合，传入 null 或 空列表）
     * @return true 如果符合规则且大于上一手牌；false 否则
     */
    public boolean isValidPlay(List<Card> playCards, List<Card> lastCards) {
        // 0. 如果打出的是王炸（绝对大过任何牌）

        if (playCards == null || playCards.isEmpty()) {
            return false;
        }

        // 解析本次出牌的牌型
        CardPattern playPattern = parsePattern(playCards);
        if (playPattern.type == CardType.ROCKET) {
            return true;
        }
        if (playPattern.type == CardType.INVALID) {
            return false; // 本身不是合法的斗地主牌型
        }

        // 如果桌上没有牌（或者上一手是自己出的，被一圈 Pass 绕回来了）
        if (lastCards == null || lastCards.isEmpty()) {
            return true;
        }

        // 解析桌上上一手牌的牌型
        CardPattern lastPattern = parsePattern(lastCards);

        // 1. 如果打出的是炸弹
        if (playPattern.type == CardType.BOMB) {
            // 王炸是最大牌型，任何炸弹都压不住
            if (lastPattern.type == CardType.ROCKET) {
                return false;
            }
            if (lastPattern.type != CardType.BOMB) {
                return true; // 炸弹大过一切非炸弹 / 非王炸牌型
            }
            return playPattern.primaryWeight > lastPattern.primaryWeight; // 都是炸弹，比权重
        }

        // 2. 如果不是炸弹，必须牌型相同，且出牌数量相同
        if (playPattern.type != lastPattern.type || playPattern.length != lastPattern.length) {
            return false;
        }

        // 3. 牌型和数量都相同，比较主牌权重
        return playPattern.primaryWeight > lastPattern.primaryWeight;
    }

    /**
     * 解析卡牌列表，识别其属于哪种牌型并提取核心权重
     */
    private CardPattern parsePattern(List<Card> cards) {
        int size = cards.size();
        if (size == 0) return new CardPattern(CardType.INVALID, 0, 0);

        // 统计各个权重出现的次数：Map<权重, 出现次数>
        Map<Integer, Long> weightCountMap = cards.stream()
                .collect(Collectors.groupingBy(Card::getWeight, Collectors.counting()));

        // 将统计结果按出现次数降序、权重降序排序，方便提取主牌
        List<Map.Entry<Integer, Long>> sortedCounts = weightCountMap.entrySet().stream()
                .sorted((e1, e2) -> {
                    int cmp = e2.getValue().compareTo(e1.getValue());
                    return cmp != 0 ? cmp : e2.getKey().compareTo(e1.getKey());
                })
                .collect(Collectors.toList());

        int maxCount = sortedCounts.get(0).getValue().intValue();
        int primaryWeight = sortedCounts.get(0).getKey();
        // 王炸 (2张牌，且权重包含了14和15)
        if (size == 2 && weightCountMap.containsKey(14) && weightCountMap.containsKey(15)) {
            return new CardPattern(CardType.ROCKET, 15, 2);
        }

        // 1. 单牌
        if (size == 1) return new CardPattern(CardType.SINGLE, primaryWeight, 1);

        // 2. 对子
        if (size == 2 && maxCount == 2) return new CardPattern(CardType.PAIR, primaryWeight, 2);

        // 3. 三不带
        if (size == 3 && maxCount == 3) return new CardPattern(CardType.TRIPLE, primaryWeight, 3);

        // 4. 炸弹 (4张一样)
        if (size == 4 && maxCount == 4) return new CardPattern(CardType.BOMB, primaryWeight, 4);

        // 5. 三带一 (总共4张，最多的一组有3张)
        if (size == 4 && maxCount == 3) return new CardPattern(CardType.TRIPLE_WITH_SINGLE, primaryWeight, 4);

        // 6. 三带一对 (总共5张，分为3张和2张)
        if (size == 5 && maxCount == 3 && sortedCounts.get(1).getValue() == 2) {
            return new CardPattern(CardType.TRIPLE_WITH_PAIR, primaryWeight, 5);
        }

        // 7. 顺子 (至少5张，最大不超过A，即权重不超过12)
        if (size >= 5 && maxCount == 1 && isConsecutive(sortedCounts)) {
            // 顺子不能包含2（权重13）
            if (sortedCounts.stream().anyMatch(e -> e.getKey() == 13)) {
                return new CardPattern(CardType.INVALID, 0, 0);
            }
            // 顺子的主牌权重取最大那张牌
            int maxWeight = sortedCounts.stream().mapToInt(Map.Entry::getKey).max().orElse(0);
            return new CardPattern(CardType.STRAIGHT, maxWeight, size);
        }

        // 8. 连对 (至少3对即6张，所有牌必须成对，且连续)
        if (size >= 6 && size % 2 == 0 && maxCount == 2 && sortedCounts.size() == size / 2) {
            if (isConsecutive(sortedCounts)) {
                // 连对也不能包含2
                if (sortedCounts.stream().anyMatch(e -> e.getKey() == 13)) {
                    return new CardPattern(CardType.INVALID, 0, 0);
                }
                int maxWeight = sortedCounts.stream().mapToInt(Map.Entry::getKey).max().orElse(0);
                return new CardPattern(CardType.STRAIGHT_PAIR, maxWeight, size);
            }
        }

        // ====== 【新增：完美飞机牌型识别】 ======
        // 寻找所有的三张牌
        List<Integer> triples = sortedCounts.stream()
                .filter(e -> e.getValue() >= 3).map(Map.Entry::getKey)
                .sorted().collect(Collectors.toList());

        if (triples.size() >= 2) {
            int maxConsecutive = 1, currentConsecutive = 1;
            int maxWeight = triples.get(0), currentMaxWeight = triples.get(0);

            for (int i = 1; i < triples.size(); i++) {
                if (triples.get(i) - triples.get(i - 1) == 1 && triples.get(i) != 13) { // 飞机不能带2
                    currentConsecutive++;
                    currentMaxWeight = triples.get(i);
                } else {
                    if (currentConsecutive > maxConsecutive) {
                        maxConsecutive = currentConsecutive;
                        maxWeight = currentMaxWeight;
                    }
                    currentConsecutive = 1;
                    currentMaxWeight = triples.get(i);
                }
            }
            if (currentConsecutive > maxConsecutive) {
                maxConsecutive = currentConsecutive;
                maxWeight = currentMaxWeight;
            }

            if (maxConsecutive >= 2) {
                // 纯飞机 (size == n*3) 或 带单牌 (size == n*4) 或 带对子 (size == n*5)
                if (size == maxConsecutive * 3 || size == maxConsecutive * 4 || size == maxConsecutive * 5) {
                    return new CardPattern(CardType.AIRPLANE, maxWeight, size);
                }
            }
        }

        return new CardPattern(CardType.INVALID, 0, 0);
    }

    /**
     * 判断提取出的键值对是否在权重上是连续的（用于判断顺子、连对）
     */
    private boolean isConsecutive(List<Map.Entry<Integer, Long>> sortedCounts) {
        List<Integer> weights = sortedCounts.stream()
                .map(Map.Entry::getKey)
                .sorted()
                .collect(Collectors.toList());
        for (int i = 1; i < weights.size(); i++) {
            if (weights.get(i) - weights.get(i - 1) != 1) {
                return false;
            }
        }
        return true;
    }
}