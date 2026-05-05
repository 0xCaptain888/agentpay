import logging
import asyncio
from typing import Optional

log = logging.getLogger("twitter")


class TwitterClient:
    def __init__(self, settings):
        self.client = None
        if settings.twitter_consumer_key:
            try:
                import tweepy
                self.client = tweepy.Client(
                    consumer_key=settings.twitter_consumer_key,
                    consumer_secret=settings.twitter_consumer_secret,
                    access_token=settings.twitter_access_token,
                    access_token_secret=settings.twitter_access_token_secret,
                )
                log.info("Twitter client initialized (live mode)")
            except Exception as e:
                log.warning(f"Twitter init failed: {e}, using mock mode")
        else:
            log.info("Twitter client initialized (mock mode)")

    async def post(self, text: str) -> str:
        """Post a tweet. Returns tweet ID or 'mock'."""
        if not self.client:
            log.info(f"[MOCK TWEET] {text}")
            return "mock"

        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None, lambda: self.client.create_tweet(text=text)
            )
            tweet_id = str(resp.data["id"])
            log.info(f"Posted tweet: {tweet_id}")
            return tweet_id
        except Exception as e:
            log.error(f"Tweet failed: {e}")
            return f"error: {e}"
