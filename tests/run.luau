--!strict
--[[
	Test entry point: `lune run tests/run` from the repo root.
]]

local testkit = require("./lib/testkit")

require("./rules.test")
require("./sources.test")
require("./map.test")

testkit.run()
