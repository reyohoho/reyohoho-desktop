mp.observe_property(
    "chapter-list",
    "native",
    function(name, value)
        if value then
            mp.set_property_native("chapter-list", {})
        end
    end
)

mp.observe_property(
    "osd-on-seek",
    "string",
    function(name, value)
        if value == "no" then
            mp.set_property("osd-on-seek", "bar")
        end
    end
)

mp.set_property("osd-on-seek", "bar")

local function block_chapter_command(table)
    return function()
        mp.osd_message("Chapter navigation disabled")

        return false
    end
end

mp.register_event(
    "seek",
    function(e)
        if e.chapter ~= nil and e.chapter ~= 0 then
            mp.commandv("seek", e.time, "absolute")

            return true
        end
    end
)

mp.observe_property(
    "osd-dimensions",
    "native",
    function()
        mp.command_native_async({"script-message", "osc-layout", "invalidate"})

        mp.command_native_async({"script-message", "osc-layout", "box"})
    end
)

mp.register_script_message(
    "osc-layout",
    function(message)
        if message == "set_osd_bar_chapters" then
            return -- Do nothing to prevent setting chapter markers
        end
    end
)

mp.register_event(
    "file-loaded",
    function()
        mp.set_property_native("chapter-list", {})

        mp.command_native_async({"script-message", "osc-layout", "invalidate"})
    end
)
