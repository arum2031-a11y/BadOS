/*
    UNO Mini for Flipper Zero (single-file package)

    This one file contains:
    1) The app code (entry point: uno_app)
    2) The manifest contents you should place in application.fam

    --- application.fam content ---
    App(
        appid="uno_fap",
        name="Uno Mini",
        apptype=FlipperAppType.EXTERNAL,
        entry_point="uno_app",
        requires=["gui"],
        stack_size=2 * 1024,
        fap_category="Games",
    )
    -------------------------------
*/

#include <furi.h>
#include <gui/gui.h>
#include <input/input.h>

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

typedef enum {
    UnoColorRed,
    UnoColorYellow,
    UnoColorGreen,
    UnoColorBlue,
    UnoColorWild,
} UnoColor;

typedef enum {
    UnoValue0,
    UnoValue1,
    UnoValue2,
    UnoValue3,
    UnoValue4,
    UnoValue5,
    UnoValue6,
    UnoValue7,
    UnoValue8,
    UnoValue9,
    UnoValueSkip,
    UnoValueReverse,
    UnoValueDraw2,
    UnoValueWild,
    UnoValueWildDraw4,
} UnoValue;

typedef struct {
    UnoColor color;
    UnoValue value;
} UnoCard;

typedef struct {
    UnoCard draw_pile[108];
    size_t draw_count;

    UnoCard player_hand[40];
    size_t player_count;

    UnoCard cpu_hand[40];
    size_t cpu_count;

    UnoCard discard_top;
    UnoColor active_color;

    bool player_turn;
    bool game_over;
    bool player_won;

    uint8_t selected;
    char status[64];
} UnoGame;

typedef struct {
    FuriMessageQueue* input_queue;
    ViewPort* view_port;
    Gui* gui;
    UnoGame game;
} UnoApp;

static const char* uno_color_name(UnoColor color) {
    switch(color) {
    case UnoColorRed:
        return "R";
    case UnoColorYellow:
        return "Y";
    case UnoColorGreen:
        return "G";
    case UnoColorBlue:
        return "B";
    case UnoColorWild:
    default:
        return "W";
    }
}

static const char* uno_value_name(UnoValue value) {
    switch(value) {
    case UnoValue0:
        return "0";
    case UnoValue1:
        return "1";
    case UnoValue2:
        return "2";
    case UnoValue3:
        return "3";
    case UnoValue4:
        return "4";
    case UnoValue5:
        return "5";
    case UnoValue6:
        return "6";
    case UnoValue7:
        return "7";
    case UnoValue8:
        return "8";
    case UnoValue9:
        return "9";
    case UnoValueSkip:
        return "S";
    case UnoValueReverse:
        return "R";
    case UnoValueDraw2:
        return "+2";
    case UnoValueWild:
        return "W";
    case UnoValueWildDraw4:
        return "+4";
    default:
        return "?";
    }
}

static bool uno_is_playable(const UnoCard* card, const UnoGame* game) {
    return (card->color == UnoColorWild) || (card->color == game->active_color) ||
           (card->value == game->discard_top.value);
}

static UnoColor uno_random_color(void) {
    return (UnoColor)(rand() % 4);
}

static void uno_push_card(UnoCard* hand, size_t* count, UnoCard card) {
    if(*count < 40) {
        hand[*count] = card;
        (*count)++;
    }
}

static UnoCard uno_take_from_draw(UnoGame* game) {
    if(game->draw_count == 0) {
        UnoCard fallback = {.color = UnoColorWild, .value = UnoValueWild};
        return fallback;
    }

    game->draw_count--;
    return game->draw_pile[game->draw_count];
}

static void uno_apply_action(UnoGame* game, bool for_player, UnoCard played) {
    size_t* target_count = for_player ? &game->cpu_count : &game->player_count;
    UnoCard* target_hand = for_player ? game->cpu_hand : game->player_hand;

    switch(played.value) {
    case UnoValueSkip:
    case UnoValueReverse:
        game->player_turn = for_player;
        break;
    case UnoValueDraw2:
        for(size_t i = 0; i < 2; i++) {
            uno_push_card(target_hand, target_count, uno_take_from_draw(game));
        }
        game->player_turn = for_player;
        break;
    case UnoValueWild:
        game->active_color = uno_random_color();
        break;
    case UnoValueWildDraw4:
        for(size_t i = 0; i < 4; i++) {
            uno_push_card(target_hand, target_count, uno_take_from_draw(game));
        }
        game->active_color = uno_random_color();
        game->player_turn = for_player;
        break;
    default:
        break;
    }
}

static void uno_build_deck(UnoGame* game) {
    game->draw_count = 0;

    for(UnoColor color = UnoColorRed; color <= UnoColorBlue; color++) {
        game->draw_pile[game->draw_count++] = (UnoCard){.color = color, .value = UnoValue0};
        for(UnoValue value = UnoValue1; value <= UnoValueDraw2; value++) {
            game->draw_pile[game->draw_count++] = (UnoCard){.color = color, .value = value};
            game->draw_pile[game->draw_count++] = (UnoCard){.color = color, .value = value};
        }
    }

    for(uint8_t i = 0; i < 4; i++) {
        game->draw_pile[game->draw_count++] = (UnoCard){.color = UnoColorWild, .value = UnoValueWild};
        game->draw_pile[game->draw_count++] =
            (UnoCard){.color = UnoColorWild, .value = UnoValueWildDraw4};
    }

    for(size_t i = game->draw_count - 1; i > 0; i--) {
        size_t j = rand() % (i + 1);
        UnoCard tmp = game->draw_pile[i];
        game->draw_pile[i] = game->draw_pile[j];
        game->draw_pile[j] = tmp;
    }
}

static void uno_start(UnoGame* game) {
    srand(furi_get_tick());
    uno_build_deck(game);

    game->player_count = 0;
    game->cpu_count = 0;
    game->selected = 0;
    game->game_over = false;
    game->player_won = false;
    game->player_turn = true;

    for(uint8_t i = 0; i < 7; i++) {
        uno_push_card(game->player_hand, &game->player_count, uno_take_from_draw(game));
        uno_push_card(game->cpu_hand, &game->cpu_count, uno_take_from_draw(game));
    }

    game->discard_top = uno_take_from_draw(game);
    while(game->discard_top.color == UnoColorWild) {
        game->discard_top = uno_take_from_draw(game);
    }

    game->active_color = game->discard_top.color;
    snprintf(game->status, sizeof(game->status), "Your turn");
}

static void uno_remove_card(UnoCard* hand, size_t* count, size_t idx) {
    if(idx >= *count) return;
    for(size_t i = idx; i + 1 < *count; i++) {
        hand[i] = hand[i + 1];
    }
    (*count)--;
}

static void uno_cpu_turn(UnoGame* game) {
    if(game->game_over) return;

    size_t chosen = SIZE_MAX;
    for(size_t i = 0; i < game->cpu_count; i++) {
        if(uno_is_playable(&game->cpu_hand[i], game)) {
            chosen = i;
            break;
        }
    }

    if(chosen == SIZE_MAX) {
        UnoCard drawn = uno_take_from_draw(game);
        uno_push_card(game->cpu_hand, &game->cpu_count, drawn);
        if(uno_is_playable(&drawn, game)) {
            chosen = game->cpu_count - 1;
        } else {
            game->player_turn = true;
            snprintf(game->status, sizeof(game->status), "CPU drew");
            return;
        }
    }

    UnoCard played = game->cpu_hand[chosen];
    game->discard_top = played;
    game->active_color = (played.color == UnoColorWild) ? uno_random_color() : played.color;
    uno_remove_card(game->cpu_hand, &game->cpu_count, chosen);
    uno_apply_action(game, false, played);

    if(game->cpu_count == 0) {
        game->game_over = true;
        game->player_won = false;
        snprintf(game->status, sizeof(game->status), "CPU wins");
        return;
    }

    if(!game->player_turn) {
        game->player_turn = true;
        snprintf(game->status, sizeof(game->status), "CPU skip!");
    } else {
        snprintf(game->status, sizeof(game->status), "Your turn");
    }
}

static void uno_try_play_player(UnoGame* game) {
    if(game->selected >= game->player_count) return;

    UnoCard chosen = game->player_hand[game->selected];
    if(!uno_is_playable(&chosen, game)) {
        snprintf(game->status, sizeof(game->status), "Invalid card");
        return;
    }

    game->discard_top = chosen;
    game->active_color = (chosen.color == UnoColorWild) ? uno_random_color() : chosen.color;
    uno_remove_card(game->player_hand, &game->player_count, game->selected);

    if(game->selected >= game->player_count && game->selected > 0) {
        game->selected--;
    }

    uno_apply_action(game, true, chosen);

    if(game->player_count == 0) {
        game->game_over = true;
        game->player_won = true;
        snprintf(game->status, sizeof(game->status), "You win!");
        return;
    }

    if(game->player_turn) {
        snprintf(game->status, sizeof(game->status), "Extra turn");
    } else {
        game->player_turn = false;
        uno_cpu_turn(game);
    }
}

static void uno_draw_card_player(UnoGame* game) {
    UnoCard drawn = uno_take_from_draw(game);
    uno_push_card(game->player_hand, &game->player_count, drawn);

    if(game->player_count > 0) {
        game->selected = game->player_count - 1;
    }

    if(!uno_is_playable(&drawn, game)) {
        game->player_turn = false;
        snprintf(game->status, sizeof(game->status), "You drew");
        uno_cpu_turn(game);
    } else {
        snprintf(game->status, sizeof(game->status), "Play or wait");
    }
}

static void uno_draw_callback(Canvas* canvas, void* ctx) {
    UnoApp* app = ctx;
    UnoGame* game = &app->game;

    canvas_clear(canvas);
    canvas_set_font(canvas, FontPrimary);
    canvas_draw_str(canvas, 2, 10, "UNO Mini");

    char top[32];
    snprintf(
        top,
        sizeof(top),
        "Top:%s%s",
        uno_color_name(game->active_color),
        uno_value_name(game->discard_top.value));
    canvas_set_font(canvas, FontSecondary);
    canvas_draw_str(canvas, 2, 20, top);

    char counts[32];
    snprintf(
        counts,
        sizeof(counts),
        "You:%u CPU:%u",
        (unsigned)game->player_count,
        (unsigned)game->cpu_count);
    canvas_draw_str(canvas, 2, 28, counts);

    canvas_draw_str(canvas, 2, 37, game->status);

    if(game->game_over) {
        canvas_set_font(canvas, FontPrimary);
        canvas_draw_str(canvas, 2, 52, game->player_won ? "OK: New game" : "OK: Retry");
        return;
    }

    if(game->player_count > 0) {
        UnoCard selected = game->player_hand[game->selected];
        char selected_text[32];
        snprintf(
            selected_text,
            sizeof(selected_text),
            "[%u/%u] %s%s",
            (unsigned)(game->selected + 1),
            (unsigned)game->player_count,
            uno_color_name(selected.color),
            uno_value_name(selected.value));
        canvas_draw_str(canvas, 2, 46, selected_text);
    }

    canvas_draw_str(canvas, 2, 61, "< > card  OK play  DOWN draw");
}

static void uno_input_callback(InputEvent* input_event, void* ctx) {
    UnoApp* app = ctx;
    furi_message_queue_put(app->input_queue, input_event, FuriWaitForever);
}

int32_t uno_app(void* p) {
    UNUSED(p);

    UnoApp* app = malloc(sizeof(UnoApp));
    app->input_queue = furi_message_queue_alloc(8, sizeof(InputEvent));
    app->view_port = view_port_alloc();

    view_port_draw_callback_set(app->view_port, uno_draw_callback, app);
    view_port_input_callback_set(app->view_port, uno_input_callback, app);

    app->gui = furi_record_open(RECORD_GUI);
    gui_add_view_port(app->gui, app->view_port, GuiLayerFullscreen);

    uno_start(&app->game);
    view_port_update(app->view_port);

    bool running = true;
    InputEvent event;
    while(running) {
        if(furi_message_queue_get(app->input_queue, &event, 100) == FuriStatusOk) {
            if(event.type != InputTypeShort) {
                continue;
            }

            if(event.key == InputKeyBack) {
                running = false;
            } else if(app->game.game_over && event.key == InputKeyOk) {
                uno_start(&app->game);
            } else if(!app->game.game_over && app->game.player_turn) {
                if(event.key == InputKeyLeft) {
                    if(app->game.selected > 0) app->game.selected--;
                } else if(event.key == InputKeyRight) {
                    if(app->game.selected + 1 < app->game.player_count) app->game.selected++;
                } else if(event.key == InputKeyOk) {
                    uno_try_play_player(&app->game);
                } else if(event.key == InputKeyDown) {
                    uno_draw_card_player(&app->game);
                }
            }

            view_port_update(app->view_port);
        }
    }

    gui_remove_view_port(app->gui, app->view_port);
    view_port_free(app->view_port);
    furi_message_queue_free(app->input_queue);
    furi_record_close(RECORD_GUI);
    free(app);

    return 0;
}
