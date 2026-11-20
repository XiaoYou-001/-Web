import json
import sqlite3
import unittest
from unittest.mock import patch
import watch


class WatchTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        watch.initialize(self.db)

    def tearDown(self):
        self.db.close()

    def test_transitions_retry_delivery_and_stale(self):
        for t, ok in enumerate([True,False,False,True,False,False,False,False,True]):
            watch.record(self.db,"chat",ok,12,"sample",t)
        mail = self.db.execute("select state from mail order by id").fetchall()
        self.assertEqual([row[0] for row in mail],["故障","正常"])
        with patch("watch.deliver",side_effect=OSError):
            watch.flush_mail(self.db,{},10)
        with patch("watch.deliver") as send:
            watch.flush_mail(self.db,{},20)
            send.assert_not_called()
            watch.flush_mail(self.db,{},100)
            self.assertEqual(send.call_count,2)
            self.assertIn("公共聊天异常",send.call_args_list[0].args[1])
            self.assertIn("已恢复",send.call_args_list[1].args[1])
        report = watch.snapshot(self.db,200)
        self.assertEqual(report["pending"],0)
        self.assertEqual(report["items"][3]["state"],"数据过期")
        self.assertEqual(report["items"][0]["state"],"等待采样")

    def test_probe_contracts(self):
        self.assertTrue(watch.validate("entry",401,{"WWW-Authenticate":'Basic realm="site"'},b""))
        self.assertFalse(watch.validate("entry",200,{},b""))
        self.assertTrue(watch.validate("chat",200,{},b'{"roomId":"general","messages":[]}'))
        self.assertFalse(watch.validate("chat",200,{},b'{"roomId":"wrong","messages":[]}'))
        self.assertFalse(watch.validate("models",200,{},b'{"models":[]}'))
        self.assertTrue(watch.validate("models",200,{},b'{"models":["demo"]}'))
        self.assertTrue(watch.validate("api",200,{},b'{"status":"ok"}'))
        self.assertFalse(watch.validate("api",200,{},b'{}'))
        self.assertFalse(watch.validate("home",200,{},b'not the travel page'))

    def test_windowed_statistics_include_only_observed_samples(self):
        for at, ok, ms in [(1, True, 80), (7200, True, 20), (7210, False, 40)]:
            watch.record(self.db, "api", ok, ms, "test", at)
        item = watch.snapshot(self.db, 7220, "1h")["items"][1]
        self.assertEqual(dict(total=2, passed=1, peak=40), item["stats"])
        self.assertEqual(item["trend"], [dict(at=7200, ms=30.0, n=2)])
        self.assertEqual([r["ms"] for r in item["recent"]], [40,20])
        self.assertEqual(watch.snapshot(self.db, 7220, "7d")["items"][1]["stats"]["total"], 3)

