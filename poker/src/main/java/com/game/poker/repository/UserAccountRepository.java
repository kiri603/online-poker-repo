package com.game.poker.repository;

import com.game.poker.entity.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

import java.util.List;
import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    boolean existsByUsername(String username);
    boolean existsByIdAndUsernameAndSessionVersionAndStatus(Long id, String username, String sessionVersion, String status);

    Optional<UserAccount> findByUsername(String username);

    Optional<UserAccount> findByLoginNameKey(String loginNameKey);
    boolean existsByLoginNameKey(String loginNameKey);
    Optional<UserAccount> findByWechatAvatarAssetId(String assetId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserAccount u where u.id = :id")
    Optional<UserAccount> findLockedById(@Param("id") Long id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update UserAccount u set u.avatarId = :avatarId, u.avatarSource = 'CATALOG', u.updatedAt = :now where u.username = :username")
    int updateAvatar(@Param("username") String username, @Param("avatarId") String avatarId,
                     @Param("now") LocalDateTime now);

    List<UserAccount> findTop10ByUsernameContainingIgnoreCaseOrderByUsernameAsc(String username);
}
