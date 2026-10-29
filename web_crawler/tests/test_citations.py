import unittest

from crawler_agent import extract_sources


class ExtractSourcesTests(unittest.TestCase):
    def test_links_match_successful_reads_and_report_read_status(self):
        sources = extract_sources(
            "Claim [Official docs](https://EXAMPLE.com/guide/#overview). "
            "See also [unread page](https://unread.example/report).",
            [
                {
                    "name": "search_web",
                    "args": {"url": "https://search.example/"},
                    "status": "completed",
                },
                {
                    "name": "READ_URL_CONTENT",
                    "args": {"url": "https://example.com/guide/"},
                    "status": "completed",
                },
                {
                    "name": "read_url_content",
                    "args": {"url": "https://failed.example/page"},
                    "status": "error",
                },
            ],
        )

        by_url = {source["url"].lower(): source for source in sources}
        read_source = next(source for source in sources if source["domain"] == "example.com")
        failed_source = next(source for source in sources if source["domain"] == "failed.example")
        unread_source = next(source for source in sources if source["domain"] == "unread.example")

        self.assertEqual(len(sources), 3)
        self.assertEqual(read_source["type"], "scraped")
        self.assertTrue(read_source["cited"])
        self.assertEqual(read_source["title"], "Official docs")
        self.assertEqual(failed_source["type"], "failed")
        self.assertFalse(failed_source["cited"])
        self.assertEqual(unread_source["type"], "referenced")
        self.assertTrue(unread_source["cited"])
        self.assertNotIn("search.example", by_url)

    def test_plain_urls_are_citations_and_non_http_links_are_ignored(self):
        sources = extract_sources(
            "Reference: https://plain.example/page. Ignore javascript:alert(1)."
        )

        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]["type"], "referenced")
        self.assertTrue(sources[0]["cited"])


if __name__ == "__main__":
    unittest.main()
