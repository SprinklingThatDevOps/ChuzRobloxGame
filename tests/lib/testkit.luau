--!strict
--[[
	A ~100 line test runner.

	Pulling in a framework would mean pulling in a package manager for one
	dependency. This prints the same green ticks and exits non-zero.
]]

local process = require("@lune/process")
local stdio = require("@lune/stdio")

local testkit = {}

type Case = { name: string, fn: () -> () }
type Suite = { name: string, cases: { Case } }

local suites: { Suite } = {}
local current: Suite? = nil

function testkit.describe(name: string, body: () -> ())
	local suite: Suite = { name = name, cases = {} }
	table.insert(suites, suite)
	current = suite
	body()
	current = nil
end

function testkit.test(name: string, fn: () -> ())
	local suite = current
	assert(suite, `test("{name}") called outside of describe()`)
	table.insert(suite.cases, { name = name, fn = fn })
end

local function render(value: any, depth: number?): string
	local level = depth or 0
	if type(value) ~= "table" or level > 3 then
		return if type(value) == "string" then `"{value}"` else tostring(value)
	end
	local parts = {}
	local isArray = #value > 0
	if isArray then
		for _, item in value do
			table.insert(parts, render(item, level + 1))
		end
	else
		local keys = {}
		for key in value do
			table.insert(keys, tostring(key))
		end
		table.sort(keys)
		for _, key in keys do
			table.insert(parts, `{key} = {render((value :: any)[key], level + 1)}`)
		end
	end
	return "{" .. table.concat(parts, ", ") .. "}"
end

testkit.render = render

function testkit.assertEqual(actual: any, expected: any, message: string?)
	if actual ~= expected then
		error(`{message or "values differ"}\n    expected: {render(expected)}\n    actual:   {render(actual)}`, 2)
	end
end

function testkit.assertTrue(value: any, message: string?)
	if not value then
		error(message or "expected a truthy value", 2)
	end
end

function testkit.assertNear(actual: number, expected: number, tolerance: number, message: string?)
	if math.abs(actual - expected) > tolerance then
		error(`{message or "values differ"}\n    expected: {expected} ±{tolerance}\n    actual:   {actual}`, 2)
	end
end

local function deepEqual(a: any, b: any): boolean
	if a == b then
		return true
	end
	if type(a) ~= "table" or type(b) ~= "table" then
		return false
	end
	for key, value in a do
		if not deepEqual(value, (b :: any)[key]) then
			return false
		end
	end
	for key in b do
		if (a :: any)[key] == nil then
			return false
		end
	end
	return true
end

function testkit.assertDeepEqual(actual: any, expected: any, message: string?)
	if not deepEqual(actual, expected) then
		error(`{message or "tables differ"}\n    expected: {render(expected)}\n    actual:   {render(actual)}`, 2)
	end
end

function testkit.assertThrows(fn: () -> (), message: string?)
	local ok = pcall(fn)
	if ok then
		error(message or "expected the call to throw", 2)
	end
end

function testkit.run()
	local passed, failed = 0, 0
	local failures: { string } = {}

	for _, suite in suites do
		stdio.write(`\n{stdio.style("bold")}{suite.name}{stdio.style("reset")}\n`)
		for _, case in suite.cases do
			local ok, err = pcall(case.fn)
			if ok then
				passed += 1
				stdio.write(`  {stdio.color("green")}✓{stdio.color("reset")} {case.name}\n`)
			else
				failed += 1
				stdio.write(`  {stdio.color("red")}✗ {case.name}{stdio.color("reset")}\n`)
				table.insert(failures, `{suite.name} › {case.name}\n    {tostring(err)}`)
			end
		end
	end

	stdio.write(`\n{passed} passed, {failed} failed\n`)
	if failed > 0 then
		for _, failure in failures do
			stdio.write(`\n{stdio.color("red")}{failure}{stdio.color("reset")}\n`)
		end
		process.exit(1)
	end
end

return testkit
