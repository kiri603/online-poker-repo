package com.game.poker.service;

import com.game.poker.auth.AuthException;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.*;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class WechatTicketStoreTest {
    WechatClient.Identity identity=new WechatClient.Identity("appid","openid",null,"server-secret");
    @Test void expiresAfterFiveMinutesAndCannotBeReused() {
        Clock clock=mock(Clock.class);when(clock.millis()).thenReturn(1000L);
        var store=new WechatTicketStore(false,null,clock);
        String value=store.issue(identity,WechatTicketStore.Purpose.AUTH,null,null);
        when(clock.millis()).thenReturn(301000L);
        assertThrows(AuthException.class,()->store.consume(value,WechatTicketStore.Purpose.AUTH));
        assertThrows(AuthException.class,()->store.consume(value,WechatTicketStore.Purpose.AUTH));
    }
    @Test void concurrentConsumptionSucceedsExactlyOnce() throws Exception {
        var store=new WechatTicketStore(false,null);
        String value=store.issue(identity,WechatTicketStore.Purpose.AUTH,null,null);
        try(var pool=Executors.newFixedThreadPool(8)) {
            var gate=new CountDownLatch(1);var results=new java.util.ArrayList<Future<Boolean>>();
            for(int i=0;i<8;i++)results.add(pool.submit(()->{gate.await();try{store.consume(value,WechatTicketStore.Purpose.AUTH);return true;}catch(AuthException e){return false;}}));
            gate.countDown();int successes=0;for(var result:results)if(result.get())successes++;
            assertThat(successes).isEqualTo(1);
        }
    }
    @Test void redisUsesAnAtomicDeleteAndFailsClosedWhenUnavailable() {
        StringRedisTemplate redis=mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String,String> values=mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        AtomicReference<String> stored=new AtomicReference<>();
        doAnswer(i->{stored.set(i.getArgument(1));return null;}).when(values).set(anyString(),anyString(),eq(Duration.ofMinutes(5)));
        when(values.getAndDelete(anyString())).thenAnswer(i->stored.getAndSet(null));
        var store=new WechatTicketStore(true,redis);
        String value=store.issue(identity,WechatTicketStore.Purpose.AUTH,null,null);
        assertThat(store.consume(value,WechatTicketStore.Purpose.AUTH).identity()).isEqualTo(identity);
        assertThrows(AuthException.class,()->store.consume(value,WechatTicketStore.Purpose.AUTH));
        when(values.getAndDelete(anyString())).thenThrow(new IllegalStateException("Redis unavailable"));
        AuthException failure=assertThrows(AuthException.class,()->store.consume(value,WechatTicketStore.Purpose.AUTH));
        assertThat(failure.getStatus().value()).isEqualTo(503);
    }
}
